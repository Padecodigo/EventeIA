import "server-only";

import {
  contingencyFirstReply,
  contingencyHiddenFees,
  contingencyQuotation,
  contingencySupplierReply,
} from "@/lib/ai/contingency";
import { getRouter } from "@/lib/ai/runtime";
import {
  routeFirstReplyParsing,
  routeHiddenFeeScan,
  routeQuotationExtraction,
  routeSupplierReply,
} from "@/lib/ai/tasks";
import { buildExtractionMessages } from "@/lib/deepseek/extractor";
import { ENGINE_VERSION } from "@/lib/engine";
import { logger } from "@/lib/logger";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

import { countUsableByCategory, quotableCategories, type CollectorDeps } from "./collector";
import { buildSupplierReplyMessages } from "./triage";

/** Agrupa mensagens picadas do fornecedor: 1 extração por fornecedor por janela de 45s. */
export const QUOTE_DEBOUNCE_MS = 45_000;

/**
 * O canal de saída legado (WhatsApp) foi removido. Não gravamos nada em
 * `whatsapp_messages`: apenas registramos a decisão de pular o follow-up com
 * um log estruturado, para que a automação nunca tente um envio frio.
 */
export function skipSupplierFollowUp(
  input: { eventId: string; prospectId: string; n: number },
  log: (payload: Record<string, unknown>, message: string) => void = (payload, message) =>
    logger.info(payload, message),
): "skipped" {
  log(
    {
      eventId: input.eventId,
      prospectId: input.prospectId,
      followup: input.n,
      reason: "whatsapp_removed",
    },
    "follow-up de cotação ignorado: canal de saída legado removido",
  );
  return "skipped";
}

export async function enqueueQuoteExtraction(
  eventId: string,
  prospectId: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const bucket = Math.floor(nowMs / QUOTE_DEBOUNCE_MS);
  return enqueue(
    QUEUE_NAMES.quoteExtraction,
    "extract",
    { eventId, prospectId },
    { jobId: `quote-${prospectId}-${String(bucket)}`, delayMs: QUOTE_DEBOUNCE_MS },
  );
}

export function createCollectorDeps(): CollectorDeps {
  const admin = getSupabaseAdmin();
  const router = getRouter();

  return {
    async loadContext({ eventId, prospectId }) {
      const { data: p } = await admin
        .from("vendor_prospects")
        .select("id,event_id,vendor_name,vendor_category,phone_e164,supplier_id")
        .eq("id", prospectId)
        .eq("event_id", eventId)
        .maybeSingle();
      if (p === null) return null;
      const { data: e } = await admin
        .from("events")
        .select("collection_ended_at,title,event_type,event_date,city,guest_count")
        .eq("id", eventId)
        .maybeSingle();
      const { data: msgs } = await admin
        .from("whatsapp_messages")
        .select("body")
        .eq("prospect_id", prospectId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: true })
        .limit(50);
      return {
        eventId,
        collectionEnded: e === null || e.collection_ended_at !== null,
        prospect: {
          id: p.id,
          name: p.vendor_name,
          category: p.vendor_category,
          phone: p.phone_e164,
          supplierId: p.supplier_id,
        },
        event: {
          title: e?.title ?? "",
          eventType: e?.event_type ?? "",
          eventDateIso: e?.event_date ?? "",
          city: e?.city ?? "",
          guestCount: e?.guest_count ?? 0,
        },
        inboundText: (msgs ?? []).map((m) => m.body).join("\n"),
      };
    },

    async getFollowupCount(eventId, prospectId) {
      const { data } = await admin
        .from("quotations")
        .select("followup_count")
        .eq("event_id", eventId)
        .eq("prospect_id", prospectId)
        .maybeSingle();
      return data?.followup_count ?? 0;
    },

    async firstReply(text, eventId) {
      if (router === null) return { value: contingencyFirstReply(text), provider: "contingency" };
      const r = await routeFirstReplyParsing(router, text, { eventId, reason: "first_reply", stage: "quote_collection" });
      return { value: r.value, provider: r.provider };
    },
    async extract(text, eventId) {
      if (router === null) return { value: contingencyQuotation(text), provider: "contingency" };
      const r = await routeQuotationExtraction(router, buildExtractionMessages(text), text, {
        eventId,
        reason: "extraction",
        stage: "quote_collection",
      });
      return { value: r.value, provider: r.provider };
    },
    async hiddenFees(text, eventId) {
      if (router === null) return { value: contingencyHiddenFees(text), provider: "contingency" };
      const r = await routeHiddenFeeScan(router, text, { eventId, reason: "hidden_fees", stage: "quote_collection" });
      return { value: r.value, provider: r.provider };
    },

    async draftReply({ eventId, text, questions, context }) {
      if (router === null) return { value: contingencySupplierReply(context), provider: "contingency" };
      const r = await routeSupplierReply(
        router,
        buildSupplierReplyMessages(text, context, questions),
        context,
        { eventId, reason: "supplier_reply", stage: "quote_collection" },
      );
      return { value: r.value, provider: r.provider };
    },

    async savePendingReply({ eventId, prospectId, kind, reply }) {
      const { error } = await admin
        .from("vendor_prospects")
        .update({
          pending_reply: reply,
          pending_reply_kind: kind,
          pending_reply_at: new Date().toISOString(),
        })
        .eq("id", prospectId)
        .eq("event_id", eventId);
      if (error !== null) throw new Error(`falha ao guardar resposta pendente (${error.code})`);
    },

    async saveDraft(row) {
      const values = {
        event_id: row.eventId,
        prospect_id: row.prospectId,
        supplier_id: row.supplierId,
        category: row.category,
        vendor_name: row.vendorName,
        vendor_contact: row.vendorContact,
        amount_cents: row.amountCents,
        fees_cents: row.feesCents,
        raw_text: row.rawText,
        extraction: row.extraction as unknown as Json,
        confidence: row.confidence,
        extraction_provider: row.provider,
        needs_followup: row.needsFollowup,
        followup_count: row.followupCount,
        status: "draft" as const,
        engine_version: ENGINE_VERSION,
        updated_at: new Date().toISOString(),
      };
      // Índice único é parcial (prospect_id not null): upsert manual.
      const { data: existing } = await admin
        .from("quotations")
        .select("id")
        .eq("event_id", row.eventId)
        .eq("prospect_id", row.prospectId)
        .maybeSingle();
      const { error } =
        existing === null
          ? await admin.from("quotations").insert(values)
          : await admin.from("quotations").update(values).eq("id", existing.id);
      if (error !== null) throw new Error(`falha ao salvar rascunho de cotação (${error.code})`);
    },

    sendFollowUp({ eventId, prospectId, n }) {
      // Sem canal de saída: registra só a decisão estruturada de pular.
      return Promise.resolve(skipSupplierFollowUp({ eventId, prospectId, n }));
    },

    async checkCollectionEnd(eventId) {
      const { data: reqs } = await admin
        .from("event_requirements")
        .select("category")
        .eq("event_id", eventId)
        .eq("selected", true);
      const { data: rows } = await admin
        .from("quotations")
        .select("category,amount_cents,confidence,needs_followup")
        .eq("event_id", eventId)
        .eq("status", "draft");
      const quotesByCategory = countUsableByCategory(rows ?? []);
      const categories = quotableCategories(reqs ?? []);
      const done =
        categories.length > 0 && categories.every((c) => (quotesByCategory[c] ?? 0) >= 5);
      if (!done) return "pending";
      logger.info({ eventId }, "meta de cotações atingida — encerrando coleta");
      return "triggered";
    },
  };
}
