import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import type { CoverageRow } from "@/lib/prospecting/coverage-loop";
import { withCoverageLoop, type CoveragePorts } from "@/lib/prospecting/coverage-turn";
import type { RespondPorts } from "@/lib/prospecting/respond";

function harness(classifyOutputs: string[]) {
  const store = new Map<string, CoverageRow[]>();
  let latest: string | null = null;
  let clock = Date.parse("2026-11-03T13:00:00.000Z");
  const sent: string[] = [];
  const coverage: CoveragePorts = {
    load: async () => (latest !== null && store.has(latest) ? { quoteId: latest, rows: store.get(latest)! } : null),
    latestQuoteId: async () => latest,
    save: async (q, _c, rows) => void store.set(q, [...rows]),
    classify: vi.fn(async () => classifyOutputs.shift() ?? "{}"),
    now: () => new Date((clock += 60_000)),
  };
  const base: RespondPorts = {
    sendReply: async (_id, text) => (sent.push(text), true),
    saveQuote: async () => void (latest = `q${String(store.size + 1)}`),
    markOptOut: async () => undefined,
    escalate: async () => undefined,
  };
  return { store, sent, coverage, base, get latest() { return latest; } };
}

const quote = { product: "buffet", specifications: null, volume: null, moq: null, priceCents: 900000, deadlineDays: null, shippingCents: null, paymentTerms: null, validUntil: null };
const garcons = (coverage: string, evidence: string) => JSON.stringify({ items: [{ item_code: "garcons", coverage, evidence, confidence: 0.9 }] });

describe("loop de cobertura (cotação → pergunta → vaga → re-pergunta → unknown final)", () => {
  it("faz no máximo 2 rodadas e não pergunta de novo depois", async () => {
    const h = harness([garcons("included", "inclui 4 garçons"), "{}", "{}"]);

    // Turno 1: fornecedor cota; agente salva e a pergunta agrupada é anexada.
    let ports = await withCoverageLoop({ ports: h.base, coverage: h.coverage, conversationId: "c1", category: "buffet", history: [{ role: "user", content: "R$ 9.000 com 4 garçons" }] });
    await ports.saveQuote("c1", null, quote);
    await ports.sendReply("c1", "Obrigado!");
    expect(h.sent[0]).toMatch(/Obrigado!\n\nPara fecharmos/);
    expect(h.sent[0]).not.toContain("garçons e copeiras?");
    const rows1 = h.store.get("q1")!;
    expect(rows1.find((r) => r.itemCode === "garcons")?.coverage).toBe("included");
    expect(rows1.find((r) => r.itemCode === "limpeza")?.roundsAsked).toBe(1);

    // Turno 2: resposta vaga ⇒ re-pergunta fechada.
    ports = await withCoverageLoop({ ports: h.base, coverage: h.coverage, conversationId: "c1", category: "buffet", history: [{ role: "assistant", content: h.sent[0]! }, { role: "user", content: "depende, a combinar" }] });
    await ports.sendReply("c1", "Entendi.");
    expect(h.sent[1]).toMatch(/sim ou não/);
    expect(h.store.get("q1")!.find((r) => r.itemCode === "limpeza")?.roundsAsked).toBe(2);

    // Turno 3: vaga de novo ⇒ sem 3ª pergunta; fica unknown (não incluído).
    ports = await withCoverageLoop({ ports: h.base, coverage: h.coverage, conversationId: "c1", category: "buffet", history: [{ role: "user", content: "pode ser" }] });
    await ports.sendReply("c1", "Combinado.");
    expect(h.sent[2]).toBe("Combinado.");
    expect(h.store.get("q1")!.find((r) => r.itemCode === "limpeza")?.coverage).toBe("unknown");
  });

  it("sem cotação e sem pergunta pendente, não anexa nada", async () => {
    const h = harness([]);
    const ports = await withCoverageLoop({ ports: h.base, coverage: h.coverage, conversationId: "c2", category: "buffet", history: [{ role: "user", content: "oi" }] });
    await ports.sendReply("c2", "Olá!");
    expect(h.sent).toEqual(["Olá!"]);
    expect(h.coverage.classify).not.toHaveBeenCalled();
  });

  it("falha no envio não marca rodada; classificador com erro mantém unknown", async () => {
    const h = harness([]);
    h.coverage.classify = vi.fn(async () => { throw new Error("llm down"); });
    const failing: RespondPorts = { ...h.base, sendReply: async () => false };
    const ports = await withCoverageLoop({ ports: failing, coverage: h.coverage, conversationId: "c3", category: "buffet", history: [{ role: "user", content: "R$ 5.000" }] });
    await ports.saveQuote("c3", null, quote);
    expect(await ports.sendReply("c3", "ok")).toBe(false);
    expect(h.store.get("q1")!.every((r) => r.roundsAsked === 0 && r.coverage === "unknown")).toBe(true);
  });

  it("categoria sem mapa não pergunta nada", async () => {
    const h = harness([]);
    const ports = await withCoverageLoop({ ports: h.base, coverage: h.coverage, conversationId: "c4", category: "convites", history: [{ role: "user", content: "R$ 300" }] });
    await ports.saveQuote("c4", null, quote);
    await ports.sendReply("c4", "Valeu");
    expect(h.sent).toEqual(["Valeu"]);
  });
});
