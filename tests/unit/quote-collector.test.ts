import { describe, expect, it } from "vitest";

import { contingencyFirstReply, contingencyHiddenFees, contingencyQuotation } from "@/lib/ai/contingency";
import {
  buildFollowUp,
  countUsableByCategory,
  MAX_FOLLOWUPS,
  mergeFees,
  processQuoteMessage,
  quotableCategories,
  resolveQuote,
  type CollectorDeps,
  type DraftRow,
} from "@/lib/quotes/collector";
import { EMPTY_QUOTATION, type NuancedQuotation } from "@/lib/schemas/quotation-extraction";

const EVENT = "11111111-1111-4111-8111-111111111111";
const PROSPECT = "22222222-2222-4222-8222-222222222222";

function fakeDeps(text: string, opts: { confidence?: number; followups?: number; ended?: boolean } = {}) {
  const drafts: DraftRow[] = [];
  const followups: string[] = [];
  const pending: { kind: string; reply: string }[] = [];
  const deps: CollectorDeps = {
    loadContext: () =>
      Promise.resolve({
        eventId: EVENT,
        collectionEnded: opts.ended ?? false,
        prospect: { id: PROSPECT, name: "Buffet Alegria", category: "buffet", phone: "+5512999990000", supplierId: null },
        event: {
          title: "Festa da Lia",
          eventType: "festa_infantil",
          eventDateIso: "2026-12-05",
          city: "Taubaté",
          guestCount: 40,
        },
        inboundText: text,
      }),
    getFollowupCount: () => Promise.resolve(opts.followups ?? 0),
    firstReply: (t) => Promise.resolve({ value: contingencyFirstReply(t), provider: "deepseek" }),
    extract: (t) =>
      Promise.resolve({
        value: { ...contingencyQuotation(t), confidence_score: opts.confidence ?? 0.9 },
        provider: "deepseek",
      }),
    hiddenFees: (t) => Promise.resolve({ value: contingencyHiddenFees(t), provider: "deepseek" }),
    draftReply: () =>
      Promise.resolve({
        value: {
          kind: "question" as const,
          reply:
            "Olá! Somos uma empresa que faz orçamentos para eventos — o evento será em Taubaté para 40 convidados. Pode confirmar os valores?",
          confidence_score: 0.8,
        },
        provider: "deepseek",
      }),
    savePendingReply: ({ kind, reply }) => {
      pending.push({ kind, reply });
      return Promise.resolve();
    },
    saveDraft: (row) => {
      drafts.push(row);
      return Promise.resolve();
    },
    sendFollowUp: ({ text: msg }) => {
      followups.push(msg);
      return Promise.resolve("dry_run");
    },
    checkCollectionEnd: () => Promise.resolve("pending"),
  };
  return { deps, drafts, followups, pending };
}

const job = { eventId: EVENT, prospectId: PROSPECT };

describe("fase 3 — coleta de cotações", () => {
  it("cotação clara vira rascunho aproveitável, sem follow-up", async () => {
    const { deps, drafts, followups } = fakeDeps("Pacote completo R$ 4.500,00\nTaxa de limpeza R$ 300,00");
    const out = await processQuoteMessage(deps, job);
    expect(out).toEqual({ status: "usable", end: "pending" });
    expect(drafts[0]).toMatchObject({ amountCents: 450000, feesCents: 30000, needsFollowup: false, provider: "deepseek" });
    expect(followups).toHaveLength(0);
  });

  it("confiança baixa ⇒ pergunta de esclarecimento (dry-run) e rascunho marcado", async () => {
    const { deps, drafts, followups } = fakeDeps("Fica uns R$ 3.000,00 mais ou menos", { confidence: 0.5 });
    const out = await processQuoteMessage(deps, job);
    expect(out.status).toBe("followup");
    expect(followups[0]).toMatch(/taxas à parte/);
    expect(followups[0]).not.toMatch(/SAIR/);
    expect(drafts[0]).toMatchObject({ needsFollowup: true, followupCount: 1 });
  });

  it(`follow-up limitado a ${String(MAX_FOLLOWUPS)} por fornecedor`, async () => {
    const { deps, followups } = fakeDeps("talvez", { confidence: 0.2, followups: MAX_FOLLOWUPS });
    expect((await processQuoteMessage(deps, job)).status).toBe("incomplete");
    expect(followups).toHaveLength(0);
  });

  it("recusa não gera rascunho; coleta encerrada é ignorada", async () => {
    const declined = fakeDeps("Não tenho interesse, obrigado");
    expect(await processQuoteMessage(declined.deps, job)).toEqual({ status: "declined" });
    expect(declined.drafts).toHaveLength(0);
    const ended = fakeDeps("R$ 100,00", { ended: true });
    expect(await processQuoteMessage(ended.deps, job)).toEqual({ status: "skipped" });
  });

  it("'respondo depois' sem preço não recebe insistência", async () => {
    const { deps, followups } = fakeDeps("Te passo amanhã", { confidence: 0 });
    expect((await processQuoteMessage(deps, job)).status).toBe("incomplete");
    expect(followups).toHaveLength(0);
  });

  it("pergunta do fornecedor gera resposta pendente para aprovação (sem follow-up)", async () => {
    const { deps, drafts, followups, pending } = fakeDeps("Qual a data? Quantas pessoas?");
    const out = await processQuoteMessage(deps, job);
    expect(out.status).toBe("drafted");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.kind).toBe("question");
    expect(pending[0]?.reply).toMatch(/orçamentos para eventos/);
    expect(followups).toHaveLength(0);
    expect(drafts[0]).toMatchObject({ needsFollowup: true });
  });

  it("total ausente: base + taxas extras; contingência limita confiança a 0,3", () => {
    const q: NuancedQuotation = { ...EMPTY_QUOTATION, base_price_cents: 100000, confidence_score: 0.95 };
    const fees = [{ category: "cleaning" as const, description: "limpeza", amount_cents: 5000, included_in_base: false }];
    expect(resolveQuote(q, fees, "nim")).toEqual({ amountCents: 105000, feesCents: 5000, confidence: 0.95 });
    expect(resolveQuote(q, fees, "contingency").confidence).toBe(0.3);
  });

  it("mergeFees não duplica categoria; conta só aproveitáveis por categoria", () => {
    const a = { category: "cleaning" as const, description: "a", amount_cents: 1, included_in_base: false };
    const b = { category: "delivery_pickup" as const, description: "b", amount_cents: 2, included_in_base: false };
    expect(mergeFees([a], [a, b])).toEqual([a, b]);
    expect(
      countUsableByCategory([
        { category: "buffet", amount_cents: 100, confidence: 0.8, needs_followup: false },
        { category: "buffet", amount_cents: 100, confidence: 0.5, needs_followup: true },
        { category: "doces", amount_cents: 0, confidence: 0.9, needs_followup: false },
      ]),
    ).toEqual({ buffet: 1 });
    expect(quotableCategories([{ category: "doces" }, { category: "buffet" }, { category: "outros" }, { category: "buffet" }])).toEqual([
      "buffet",
      "doces",
    ]);
    expect(buildFollowUp("", { total: true, fees: false })).toMatch(/valor total/);
  });
});
