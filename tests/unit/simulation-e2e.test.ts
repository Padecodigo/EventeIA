/**
 * Simulação ponta a ponta (dry-run, sem rede): webhook inbound → extração pelo roteador
 * (DeepSeek simulado) → rascunho → regra dos 5 por categoria → fim da coleta →
 * cenários (budget_snapshots) → logout → notificação. Nenhuma mensagem real é enviada.
 */
import { describe, expect, it } from "vitest";

import { createMockLlmClient } from "@/lib/ai/clients";
import { createMemoryLedger, createRouter, type PriceTable } from "@/lib/ai/router";
import { routeFirstReplyParsing, routeHiddenFeeScan, routeQuotationExtraction } from "@/lib/ai/tasks";
import { countUsableByCategory, processQuoteMessage, quotableCategories, type CollectorDeps, type DraftRow } from "@/lib/quotes/collector";
import { deliverEventQuotes } from "@/lib/quotes/delivery";
import type { QuotationRowForScenario } from "@/lib/quotes/scenarios";
import { completeCollectionIfReady, finishCollection, type SessionDeps } from "@/lib/whatsapp/session-manager";

const prices: PriceTable = {
  nim: { inPer1M: 100_000, outPer1M: 400_000 },
  grok: { inPer1M: 3_000_000, outPer1M: 15_000_000 },
  deepseek: { inPer1M: 300_000, outPer1M: 1_200_000 },
};
const EVENT = "11111111-1111-4111-8111-111111111111";
const pid = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;

describe("simulação E2E da coleta (mock, dry-run)", () => {
  it("coleta 5 por categoria, entrega 3 cenários, desconecta e notifica uma vez", async () => {
    const ledger = createMemoryLedger();
    const router = createRouter({ clients: [createMockLlmClient("deepseek", 0.9)], ledger, prices, cap: { switchPct: 25, bootstrapMicroUsd: 0 } });
    const requirements = [{ category: "buffet" }, { category: "doces" }, { category: "outros" }];
    const prospects = Array.from({ length: 11 }, (_, i) => ({
      id: pid(i), name: `Fornecedor ${i}`, category: i < 6 ? "buffet" : "doces", phone: `+55119000000${String(i).padStart(2, "0")}`, supplierId: null,
    }));
    const inbox = new Map<string, string>();
    const drafts = new Map<string, DraftRow>();
    const followups: { phone: string; status: "canceled" }[] = [];
    const log: string[] = [];
    let status = "active";
    let delivered: string | null = null;
    const snapshots: unknown[] = [];

    const asRows = (): QuotationRowForScenario[] =>
      [...drafts.values()].map((d) => ({
        id: d.prospectId, category: d.category, vendor_name: d.vendorName, vendor_contact: d.vendorContact,
        amount_cents: d.amountCents, fees_cents: d.feesCents, confidence: d.confidence, needs_followup: d.needsFollowup,
        extraction: { fees: d.extraction.fees },
      }));

    const session: SessionDeps = {
      now: () => Date.UTC(2026, 9, 24, 13),
      getStatus: () => Promise.resolve(status),
      setStatus: (_i, s) => { status = s; log.push(`status:${s}`); return Promise.resolve(); },
      logout: () => { log.push("logout"); return Promise.resolve(); },
      pauseEventJobs: () => Promise.resolve(),
      scheduleWindowEnd: () => Promise.resolve(),
      triggerCollectionEnd: async (instance, eventId) => { log.push("trigger"); await finishCollection(session, { instance, eventId, reason: "collection_complete" }); },
      deliverQuotes: async (eventId) => {
        log.push("deliver");
        await deliverEventQuotes({
          engineVersion: "v1",
          claim: () => { const ok = delivered === null; delivered ??= "now"; return Promise.resolve(ok); },
          release: () => { delivered = null; return Promise.resolve(); },
          load: () => Promise.resolve({ requirements, quotations: asRows() }),
          insertSnapshots: (rows) => { snapshots.push(...rows); return Promise.resolve(); },
        }, eventId);
      },
      notifyQuotationsReady: (_e, reason) => { log.push(`notify:${reason}`); return Promise.resolve(); },
      warn: () => undefined,
    };

    const deps: CollectorDeps = {
      loadContext: (job) => {
        const p = prospects.find((x) => x.id === job.prospectId);
        return Promise.resolve(p ? { eventId: job.eventId, collectionEnded: delivered !== null, prospect: p, inboundText: inbox.get(p.id) ?? "" } : null);
      },
      getFollowupCount: (_e, p) => Promise.resolve(drafts.get(p)?.followupCount ?? 0),
      firstReply: async (t) => { const r = await routeFirstReplyParsing(router, t); return { value: r.value, provider: r.provider }; },
      extract: async (t) => { const r = await routeQuotationExtraction(router, [{ role: "user", content: t }], t); return { value: r.value, provider: r.provider }; },
      hiddenFees: async (t) => { const r = await routeHiddenFeeScan(router, t); return { value: r.value, provider: r.provider }; },
      saveDraft: (row) => { drafts.set(row.prospectId, row); return Promise.resolve(); },
      // dry-run: follow-up registrado como canceled, nunca enviado.
      sendFollowUp: (i) => { followups.push({ phone: i.phone, status: "canceled" }); return Promise.resolve("dry_run"); },
      checkCollectionEnd: () =>
        completeCollectionIfReady(session, {
          instance: "inst-sim", eventId: EVENT,
          quotesByCategory: countUsableByCategory(asRows().map((r) => ({ ...r, confidence: r.confidence }))),
          categories: quotableCategories(requirements),
        }),
    };

    // Fornecedor 0 manda mensagem vaga primeiro (sem preço) → follow-up simulado.
    inbox.set(pid(0), "Oi! Tenho disponibilidade sim, vou te passar os detalhes.");
    expect((await processQuoteMessage(deps, { eventId: EVENT, prospectId: pid(0) })).status).not.toBe("usable");
    expect(followups).toHaveLength(1);

    const outcomes: string[] = [];
    for (let i = 1; i < 11; i += 1) {
      inbox.set(pid(i), `Orçamento: total R$ ${String(2000 + i * 150)},00 para 100 pessoas\nTaxa de limpeza R$ 150,00`);
      const r = await processQuoteMessage(deps, { eventId: EVENT, prospectId: pid(i) });
      outcomes.push("end" in r ? r.end : r.status);
    }

    expect(outcomes.filter((o) => o === "triggered")).toHaveLength(1);
    expect(log).toEqual(["trigger", "status:draining", "deliver", "logout", "status:disconnected", "notify:collection_complete"]);
    expect(snapshots).toHaveLength(3);
    expect(ledger.entries.every((e) => e.provider === "deepseek")).toBe(true);

    // Mensagem tardia após a entrega é ignorada; nova finalização não duplica nada.
    inbox.set(pid(0), "Total R$ 1.000,00");
    expect((await processQuoteMessage(deps, { eventId: EVENT, prospectId: pid(0) })).status).toBe("skipped");
    await finishCollection(session, { instance: "inst-sim", eventId: EVENT, reason: "window_closed" });
    expect(snapshots).toHaveLength(3);
  });
});
