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
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { recipientOptedOut } from "@/lib/whatsapp/opt-out-runtime";
import {
  lastInboundAt,
  resolveEventChannel,
  sendTextVia,
  WindowClosedError,
} from "@/lib/whatsapp/provider";
import { toSessionState } from "@/lib/whatsapp/session-lifecycle";
import { completeCollectionIfReady } from "@/lib/whatsapp/session-manager";
import { createSessionDeps, findEventInstance } from "@/lib/whatsapp/session-runtime";

import { countUsableByCategory, quotableCategories, type CollectorDeps } from "./collector";
import { buildSupplierReplyMessages } from "./triage";

/** Agrupa mensagens picadas do fornecedor: 1 extração por fornecedor por janela de 45s. */
export const QUOTE_DEBOUNCE_MS = 45_000;

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

    async sendFollowUp({ eventId, prospectId, phone, text, n }) {
      const env = serverEnv();
      const { data: p } = await admin
        .from("vendor_prospects")
        .select("dry_run,status,supplier_id")
        .eq("id", prospectId)
        .maybeSingle();
      if (p === null) return "skipped";
      if (await recipientOptedOut({ phoneE164: phone, prospectStatus: p.status, supplierId: p.supplier_id }))
        return "skipped";
      const channel = await resolveEventChannel(eventId);
      const instance = await findEventInstance(eventId);
      const { data: inst } =
        channel === "cloud" || instance === null
          ? { data: null }
          : await admin
              .from("whatsapp_instances")
              .select("status")
              .eq("instance_name", instance)
              .maybeSingle();
      const live =
        !env.DISCOVERY_DRY_RUN &&
        !p.dry_run &&
        (channel === "cloud" ||
          (instance !== null && toSessionState(inst?.status ?? "") === "active"));
      const idempotencyKey = `followup:${prospectId}:${String(n)}`;
      const base = {
        event_id: eventId,
        prospect_id: prospectId,
        direction: "outbound" as const,
        template: "quote_followup",
        channel,
        to_number_e164: phone,
        body: text,
        idempotency_key: idempotencyKey,
      };
      if (!live) {
        // Dry-run/simulação: NUNCA envia; só registra a pergunta que seria feita.
        await admin
          .from("whatsapp_messages")
          .upsert(
            { ...base, status: "canceled", error: "dry_run" },
            { onConflict: "idempotency_key", ignoreDuplicates: true },
          );
        return "dry_run";
      }
      let sent: { externalMessageId?: string };
      try {
        sent = await sendTextVia(channel, {
          instance: instance ?? "",
          to: phone,
          text,
          lastInboundAt: channel === "cloud" ? await lastInboundAt(phone) : null,
          eventId,
        });
      } catch (error) {
        if (!(error instanceof WindowClosedError)) throw error;
        // Cloud API fora da janela de 24h: não envia texto livre.
        await admin
          .from("whatsapp_messages")
          .upsert(
            { ...base, status: "canceled", error: "window_closed" },
            { onConflict: "idempotency_key", ignoreDuplicates: true },
          );
        return "skipped";
      }
      await admin.from("whatsapp_messages").upsert(
        {
          ...base,
          status: "sent",
          sent_at: new Date().toISOString(),
          external_message_id: sent.externalMessageId ?? null,
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true },
      );
      return "sent";
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
      const instance = await findEventInstance(eventId);
      const deps = createSessionDeps();
      if (instance !== null) {
        const r = await completeCollectionIfReady(deps, {
          instance,
          eventId,
          quotesByCategory,
          categories,
        });
        if (r !== "not_active") return r;
      }
      // Sem sessão ativa (simulação/sessão perdida): encerra direto quando a meta for atingida.
      const done =
        categories.length > 0 && categories.every((c) => (quotesByCategory[c] ?? 0) >= 5);
      if (!done) return "pending";
      await deps.triggerCollectionEnd(null, eventId);
      logger.info({ eventId }, "meta de cotações atingida — encerrando coleta");
      return "triggered";
    },
  };
}
