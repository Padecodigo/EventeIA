import "server-only";

import { serverEnv } from "@/lib/env";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { sendInstagramText, sendMessengerText } from "@/lib/meta/client";
import type { Json } from "@/lib/supabase/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { AgentMessage } from "./agent";
import type { StructuredQuote } from "./quote";
import { notifyEscalation, type EscalationNotice } from "./notify";
import type { RespondPorts } from "./respond";

/**
 * Portas de resposta do agente sobre o Supabase + Graph API.
 *
 * O client é acessado por uma interface mínima porque os tipos gerados ainda não
 * conhecem as tabelas da migração 0053 (some quando `supabase gen types` rodar).
 */

interface MessageRow {
  direction: "in" | "out";
  body: string;
}

interface RespondDb {
  from(table: "prospect_messages"): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): Promise<{ data: MessageRow[] | null }>;
      };
    };
  };
  from(table: "prospect_quotes"): {
    insert(values: Record<string, unknown>): Promise<{ error: { code?: string } | null }>;
  };
  from(table: "prospect_conversations" | "suppliers"): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: unknown }>;
    };
  };
}

/** Histórico da conversa no formato de mensagens do agente (in → user, out → assistant). */
export async function loadHistory(db: RespondDb, conversationId: string): Promise<AgentMessage[]> {
  const { data } = await db
    .from("prospect_messages")
    .select("direction,body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => ({
    role: row.direction === "in" ? "user" : "assistant",
    content: row.body,
  }));
}

export interface MetaSendConfig {
  channel: "instagram" | "messenger";
  /** Obrigatório no Instagram. */
  instagramBusinessId?: string;
  /** Obrigatório no Messenger. */
  pageId?: string;
  accessToken: string;
  apiVersion?: string;
}

export interface RespondPortsDeps {
  db: RespondDb;
  message: MetaSendConfig;
  recipientId: string;
  /** Injetável nos testes; default = feed canônico + Telegram opcional. */
  notify?: (notice: EscalationNotice) => Promise<void>;
}

async function defaultNotify(notice: EscalationNotice): Promise<void> {
  const env = serverEnv();
  const telegram =
    env.TELEGRAM_BOT_TOKEN !== undefined && env.TELEGRAM_CHAT_ID !== undefined
      ? { botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID }
      : undefined;
  await notifyEscalation(
    {
      feed: async (type, payload) => {
        await emitFeed(getSupabaseAdmin(), {
          type,
          actorType: "system",
          aggregateType: "vendor",
          aggregateId: notice.conversationId,
          payload: payload as Json,
          correlationId: notice.conversationId,
          source: "app",
        });
      },
      ...(telegram !== undefined ? { telegram } : {}),
    },
    notice,
  );
}

export function createSupabaseRespondPorts(deps: RespondPortsDeps): RespondPorts {
  return {
    async sendReply(_conversationId, text) {
      const result =
        deps.message.channel === "messenger"
          ? await sendMessengerText({
              accessToken: deps.message.accessToken,
              pageId: deps.message.pageId ?? "",
              recipientId: deps.recipientId,
              text,
              apiVersion: deps.message.apiVersion,
            })
          : await sendInstagramText({
              accessToken: deps.message.accessToken,
              instagramBusinessId: deps.message.instagramBusinessId ?? "",
              recipientId: deps.recipientId,
              text,
              apiVersion: deps.message.apiVersion,
            });
      if (!result.ok) {
        logger.warn({ status: result.status }, "falha ao responder DM do fornecedor");
      }
    },

    async saveQuote(conversationId, supplierId, quote) {
      const { error } = await deps.db.from("prospect_quotes").insert({
        conversation_id: conversationId,
        supplier_id: supplierId,
        product: quote.product,
        specifications: quote.specifications,
        volume: quote.volume,
        moq: quote.moq,
        price_cents: quote.priceCents,
        deadline_days: quote.deadlineDays,
        shipping_cents: quote.shippingCents,
        payment_terms: quote.paymentTerms,
        valid_until: quote.validUntil,
        status: "draft",
      });
      if (error !== null) throw new Error(`falha ao salvar cotação (${error.code ?? "?"})`);
    },

    async markOptOut(conversationId, supplierId) {
      await deps.db.from("prospect_conversations").update({ status: "opted_out" }).eq("id", conversationId);
      if (supplierId !== null) {
        await deps.db.from("suppliers").update({ opt_out_at: new Date().toISOString() }).eq("id", supplierId);
      }
    },

    async escalate(conversationId, reason) {
      await deps.db.from("prospect_conversations").update({ status: "awaiting_human" }).eq("id", conversationId);
      await (deps.notify ?? defaultNotify)({ conversationId, reason });
      logger.info({ conversationId, reason }, "prospecção: proposta escalada ao humano");
    },
  };
}

export function defaultRespondDb(): RespondDb {
  return getSupabaseAdmin() as unknown as RespondDb;
}

export type { RespondDb, StructuredQuote };
