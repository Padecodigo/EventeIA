import "server-only";

import { serverEnv } from "@/lib/env";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { sendInstagramText, sendMessengerText, type MetaSendResult } from "@/lib/meta/client";
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
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): Promise<{ data: MessageRow[] | null }>;
        };
      };
    };
    insert(values: Record<string, unknown>): Promise<{ error: { code?: string } | null }>;
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

const HISTORY_LIMIT = 20;
const HISTORY_MAX_CHARS = 8000;

/** Corta o histórico pelo total de caracteres, descartando as mensagens mais antigas. */
function capHistoryChars(messages: AgentMessage[], maxChars: number): AgentMessage[] {
  let total = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (total <= maxChars) return messages;
  let drop = 0;
  for (const message of messages) {
    if (total <= maxChars) break;
    total -= message.content.length;
    drop += 1;
  }
  return messages.slice(drop);
}

/** Histórico da conversa no formato de mensagens do agente (in → user, out → assistant). */
export async function loadHistory(db: RespondDb, conversationId: string): Promise<AgentMessage[]> {
  const { data } = await db
    .from("prospect_messages")
    .select("direction,body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const messages = (data ?? []).slice().reverse().map((row) => ({
    role: row.direction === "in" ? ("user" as const) : ("assistant" as const),
    content: row.body,
  }));
  return capHistoryChars(messages, HISTORY_MAX_CHARS);
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
  /** Injetável nos testes; default = clientes reais da Graph API. */
  send?: (message: MetaSendConfig, recipientId: string, text: string) => Promise<MetaSendResult>;
}

async function defaultSend(
  message: MetaSendConfig,
  recipientId: string,
  text: string,
): Promise<MetaSendResult> {
  return message.channel === "messenger"
    ? sendMessengerText({
        accessToken: message.accessToken,
        pageId: message.pageId ?? "",
        recipientId,
        text,
        apiVersion: message.apiVersion,
      })
    : sendInstagramText({
        accessToken: message.accessToken,
        instagramBusinessId: message.instagramBusinessId ?? "",
        recipientId,
        text,
        apiVersion: message.apiVersion,
      });
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

/**
 * Marca a conversa (e o fornecedor, quando conhecido) como optado-fora (LGPD).
 * Independente de token do Meta: usado pelo webhook no opt-out determinístico,
 * sem precisar construir `RespondPorts` (que exige `accessToken`).
 */
export async function markSupplierOptOut(
  db: RespondDb,
  conversationId: string,
  supplierId: string | null,
): Promise<void> {
  await db.from("prospect_conversations").update({ status: "opted_out" }).eq("id", conversationId);
  if (supplierId !== null) {
    await db
      .from("suppliers")
      .update({ opt_out_at: new Date().toISOString(), status: "opt-out" })
      .eq("id", supplierId);
  }
}

export function createSupabaseRespondPorts(deps: RespondPortsDeps): RespondPorts {
  return {
    async sendReply(conversationId, text) {
      const send = deps.send ?? defaultSend;
      const result = await send(deps.message, deps.recipientId, text);
      if (!result.ok) {
        logger.warn({ status: result.status }, "falha ao responder DM do fornecedor");
        return false;
      }
      const { error } = await deps.db.from("prospect_messages").insert({
        conversation_id: conversationId,
        direction: "out",
        body: text,
        external_id: result.messageId ?? null,
      });
      if (error !== null) {
        logger.warn({ code: error.code, conversationId }, "falha ao gravar mensagem de saída");
      }
      return true;
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
      if (supplierId !== null) {
        await deps.db.from("suppliers").update({ status: "cotou" }).eq("id", supplierId);
      }
    },

    async markOptOut(conversationId, supplierId) {
      await markSupplierOptOut(deps.db, conversationId, supplierId);
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
