import { describe, expect, it } from "vitest";

import {
  ingestBatch,
  runDiscoveryRound,
  type DiscoveryDeps,
  type DiscoveryEvent,
  type ProspectJobInput,
} from "@/lib/discovery/engine";
import type { DiscoveryProvider } from "@/lib/discovery/providers/types";

function makeDeps(overrides: Partial<DiscoveryDeps> = {}, event: Partial<DiscoveryEvent> = {}) {
  const jobs: ProspectJobInput[] = [];
  const runs: { provider: string; category: string; status: string }[] = [];
  const scheduled: number[] = [];
  const prospects: { phone: string; category: string; name: string }[] = [];
  let n = 0;
  const deps: DiscoveryDeps = {
    now: () => new Date("2026-10-24T13:00:00Z"),
    dryRunAll: true,
    loadEvent: () =>
      Promise.resolve({
        id: "11111111-1111-4111-8111-111111111111",
        title: "Casamento Ana",
        eventType: "casamento",
        eventDateIso: "2026-12-12",
        guestCount: 100,
        city: "Taubaté",
        regionCode: "sudeste",
        status: "active",
        ownerId: "22222222-2222-4222-8222-222222222222",
        workspaceId: null,
        interviewCompleted: true,
        discoveryStartedAt: null,
        requirements: [
          { category: "buffet", label: "Buffet", quantity: 100, unit: "por_pessoa", notes: null },
        ],
        ...event,
      }),
    quotesByCategory: () => Promise.resolve({}),
    eventProspects: () => Promise.resolve(prospects),
    isPhoneOptedOut: (p) => Promise.resolve(p === "+5512991110000"),
    upsertSupplier: () =>
      Promise.resolve({
        id: `33333333-3333-4333-8333-33333333333${String(n++ % 10)}`,
        optOutAt: null,
        lastContactedAt: null,
      }),
    cachedSuppliers: () => Promise.resolve([]),
    ensureInstance: () => Promise.resolve("eventeia-22222222"),
    insertProspect: (p) => {
      prospects.push({ phone: p.phoneE164, category: p.category, name: p.name });
      return Promise.resolve(`p-${String(prospects.length)}`);
    },
    enqueueProspect: (job) => {
      jobs.push(job);
      return Promise.resolve(true);
    },
    reserveProviderCall: () => Promise.resolve(true),
    recordRun: (r) => {
      runs.push(r);
      return Promise.resolve();
    },
    markDiscovery: () => Promise.resolve(),
    scheduleRound: (_e, _r, d) => {
      scheduled.push(d);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { deps, jobs, runs, scheduled };
}

const fixed = (name: string, phones: string[]): DiscoveryProvider => ({
  name,
  search: (q) =>
    Promise.resolve(
      phones.map((phone, i) => ({
        name: `Fornecedor ${String(i)}`,
        category: q.category,
        phone,
        sourceUrl: "https://exemplo.com.br",
      })),
    ),
});

describe("runDiscoveryRound", () => {
  it("enfileira novos fornecedores em dry-run, ignora opt-out/duplicados e agenda a próxima rodada", async () => {
    const { deps, jobs, runs, scheduled } = makeDeps();
    const summary = await runDiscoveryRound(
      deps,
      [fixed("grok", ["(12) 99111-0000", "(12) 99111-0001", "(12) 99111-0001", "123"])],
      {
        eventId: "11111111-1111-4111-8111-111111111111",
        round: 0,
      },
    );
    expect(summary.status).toBe("running");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ dryRun: true, category: "buffet" });
    expect(jobs[0]?.messageText).not.toContain("SAIR");
    expect(runs.some((r) => r.provider === "grok")).toBe(true);
    expect(scheduled.length).toBe(1);
  });
  it("não roda sem entrevista concluída", async () => {
    const { deps, jobs } = makeDeps({}, { interviewCompleted: false });
    const s = await runDiscoveryRound(deps, [fixed("grok", ["(12) 99111-0001"])], {
      eventId: "x",
      round: 0,
    });
    expect(s.status).toBe("not_ready");
    expect(jobs).toHaveLength(0);
  });
  it("respeita o teto de chamadas por evento/dia", async () => {
    const { deps, jobs, runs } = makeDeps({ reserveProviderCall: () => Promise.resolve(false) });
    await runDiscoveryRound(deps, [fixed("grok", ["(12) 99111-0001"])], { eventId: "x", round: 0 });
    expect(jobs).toHaveLength(0);
    expect(runs.every((r) => r.status === "skipped")).toBe(true);
  });
  it("encerra após o prazo de 24h", async () => {
    const { deps } = makeDeps({}, { discoveryStartedAt: new Date("2026-10-21T00:00:00Z") });
    const s = await runDiscoveryRound(deps, [], { eventId: "x", round: 3 });
    expect(s).toMatchObject({ status: "ended", reason: "time" });
  });
});

describe("orçamento limite na prospecção (0072)", () => {
  it("o job recebe o limite como contexto, mas a mensagem ao fornecedor não o revela", async () => {
    const { deps, jobs } = makeDeps({}, { budgetLimitCents: 2_500_000 });
    await runDiscoveryRound(deps, [fixed("grok", ["(12) 99111-0001"])], {
      eventId: "11111111-1111-4111-8111-111111111111",
      round: 0,
    });
    expect(jobs[0]?.budgetLimitCents).toBe(2_500_000);
    expect(jobs[0]?.messageText).not.toMatch(/25\.000|or[çc]amento|limite/i);
  });

  it("regressão: evento sem limite segue com null", async () => {
    const { deps, jobs } = makeDeps();
    await runDiscoveryRound(deps, [fixed("grok", ["(12) 99111-0001"])], {
      eventId: "11111111-1111-4111-8111-111111111111",
      round: 0,
    });
    expect(jobs[0]?.budgetLimitCents).toBeNull();
  });
});

describe("ingestBatch", () => {
  it("contabiliza resultados por desfecho", async () => {
    const { deps } = makeDeps();
    const r = await ingestBatch(deps, {
      eventId: "x",
      provider: "deepseek",
      suppliers: [
        {
          name: "Buffet A",
          category: "buffet",
          phone: "(12) 99111-0002",
          sourceUrl: "https://a.com.br",
        },
        { name: "Sem fone", category: "buffet", sourceUrl: "https://b.com.br" },
        { name: "?" },
      ],
    });
    expect(r).toEqual({
      ok: true,
      outcomes: {
        enqueued: 1,
        invalid: 1,
        no_phone: 1,
        duplicate: 0,
        opted_out: 0,
        recent_contact: 0,
        queue_down: 0,
      },
    });
  });
});

describe("itens livres na rodada de descoberta (integração)", () => {
  it("busca cada item livre pelas palavras-chave e pergunta se oferecem exatamente o item", async () => {
    const queries: { category: string; freeText?: string }[] = [];
    const provider: DiscoveryProvider = {
      name: "grok",
      search: (q) => {
        queries.push({
          category: q.category,
          ...(q.freeText !== undefined ? { freeText: q.freeText } : {}),
        });
        return Promise.resolve([
          {
            name: "Festa Fun",
            category: q.category,
            phone: `(12) 9911${String(queries.length).padStart(1, "0")}-000${String(queries.length)}`,
            sourceUrl: "https://exemplo.com.br",
          },
        ]);
      },
    };
    const { deps, jobs } = makeDeps(
      {},
      {
        requirements: [
          {
            itemCode: "buffet_jantar",
            category: "buffet",
            label: "Buffet",
            quantity: 100,
            unit: "por_pessoa",
            notes: null,
          },
          {
            itemCode: "livre_brinquedos_inflaveis",
            category: "recreacao",
            label: "brinquedos infláveis",
            quantity: 1,
            unit: "pacote",
            notes: "brinquedos infláveis, pula pula",
          },
          {
            itemCode: "livre_magico_para_criancas",
            category: "recreacao",
            label: "mágico para crianças",
            quantity: 1,
            unit: "pacote",
            notes: "mágico infantil",
          },
        ],
      },
    );
    await runDiscoveryRound(deps, [provider], {
      eventId: "11111111-1111-4111-8111-111111111111",
      round: 0,
    });
    expect(queries).toContainEqual({ category: "buffet" });
    expect(queries).toContainEqual({
      category: "recreacao",
      freeText: "brinquedos infláveis pula pula",
    });
    expect(queries).toContainEqual({ category: "recreacao", freeText: "mágico infantil" });
    const rec = jobs.find((j) => j.category === "recreacao");
    expect(rec?.dryRun).toBe(true);
    expect(rec?.messageText).toContain(
      "Vocês oferecem exatamente: brinquedos infláveis; mágico para crianças?",
    );
    expect(jobs.find((j) => j.category === "buffet")?.messageText).not.toContain(
      "oferecem exatamente",
    );
  });
});
