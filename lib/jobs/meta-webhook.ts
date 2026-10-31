import "server-only";

import { getDeepSeekClient } from "@/lib/deepseek/client";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendPrivateReply } from "@/lib/meta/publishing";
import {
  resolveInstagramSupplier,
  resolveInstagramSupplierByHandle,
  type MetaSupplier,
  type MetaSupplierLookup,
} from "@/lib/meta/resolve";
import type { MetaCommentEvent, MetaInboundMessage } from "@/lib/meta/webhook";
import { PRIVATE_REPLY_OPENER } from "@/lib/prospecting/content";
import { handleInbound, type ProspectStore } from "@/lib/prospecting/inbound";
import { respondToInbound, shouldAgentRespond } from "@/lib/prospecting/respond";
import {
  createSupabaseRespondPorts,
  defaultRespondDb,
  loadHistory,
  markSupplierOptOut,
  type RespondDb,
} from "@/lib/prospecting/supabase-respond";
import { createSupabaseProspectStore } from "@/lib/prospecting/supabase-store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Processamento assíncrono do webhook do Meta (Instagram + Messenger), movido
 * para fora da rota. A rota persiste e enfileira; este worker resolve o
 * fornecedor, trata a entrada (DM/comentário) e responde — preservando o
 * opt-out determinístico (LGPD): nunca responde quando a mensagem é pedido de
 * parada ou a conversa já está `opted_out`.
 */

export interface MetaWebhookJobData {
  kind: "message" | "comment";
  webhookEventId: string;
  event: MetaInboundMessage | MetaCommentEvent;
}

interface WebhookEventRow {
  id: string;
  status: string;
}

interface WebhookEventsDb {
  from(table: "webhook_events"): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{ data: WebhookEventRow | null; error: unknown }>;
        };
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): {
        eq(column: string, value: string): Promise<{ error: unknown }>;
      };
    };
  };
}

export interface MetaWebhookJobDeps {
  env: {
    keyword: string;
    accessToken?: string;
    igBusinessId?: string;
    pageId?: string;
  };
  store: ProspectStore;
  respondDb: RespondDb;
  lookup: MetaSupplierLookup;
  webhookEvents: WebhookEventsDb;
  resolveSupplier: (
    lookup: MetaSupplierLookup,
    igSid: string,
    accessToken: string,
  ) => Promise<MetaSupplier>;
  resolveSupplierByHandle: (
    lookup: MetaSupplierLookup,
    handle: string,
  ) => Promise<MetaSupplier>;
  inbound: typeof handleInbound;
  markOptOut: typeof markSupplierOptOut;
  shouldRespond: typeof shouldAgentRespond;
  loadHistory: typeof loadHistory;
  respond: typeof respondToInbound;
  getClient: typeof getDeepSeekClient;
  buildPorts: typeof createSupabaseRespondPorts;
  sendReply: typeof sendPrivateReply;
  now: () => Date;
}

function configured(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

export function defaultMetaWebhookJobDeps(): MetaWebhookJobDeps {
  const admin = getSupabaseAdmin();
  const env = serverEnv();
  return {
    env: {
      keyword: env.META_PROSPECT_KEYWORD,
      accessToken: env.META_ACCESS_TOKEN,
      igBusinessId: env.META_INSTAGRAM_BUSINESS_ID,
      pageId: env.META_PAGE_ID,
    },
    store: createSupabaseProspectStore(),
    respondDb: defaultRespondDb(),
    lookup: admin as unknown as MetaSupplierLookup,
    webhookEvents: admin as unknown as WebhookEventsDb,
    resolveSupplier: resolveInstagramSupplier,
    resolveSupplierByHandle: resolveInstagramSupplierByHandle,
    inbound: handleInbound,
    markOptOut: markSupplierOptOut,
    shouldRespond: shouldAgentRespond,
    loadHistory,
    respond: respondToInbound,
    getClient: getDeepSeekClient,
    buildPorts: createSupabaseRespondPorts,
    sendReply: sendPrivateReply,
    now: () => new Date(),
  };
}

export function externalEventIdOf(data: MetaWebhookJobData): string {
  return data.kind === "message"
    ? (data.event as MetaInboundMessage).eventId
    : (data.event as MetaCommentEvent).commentId;
}

async function loadWebhookEvent(
  db: WebhookEventsDb,
  externalEventId: string,
): Promise<WebhookEventRow | null> {
  const { data, error } = await db
    .from("webhook_events")
    .select("id,status")
    .eq("source", "meta")
    .eq("external_event_id", externalEventId)
    .maybeSingle();
  if (error !== null) {
    throw new Error(`falha ao ler webhook_events (${JSON.stringify(error)})`);
  }
  return data;
}

async function updateWebhookEventStatus(
  db: WebhookEventsDb,
  externalEventId: string,
  status: "processed" | "failed",
): Promise<void> {
  const { error } = await db
    .from("webhook_events")
    .update({ status, processed_at: new Date().toISOString() })
    .eq("source", "meta")
    .eq("external_event_id", externalEventId);
  if (error !== null) {
    throw new Error(`falha ao atualizar webhook_events (${JSON.stringify(error)})`);
  }
}

async function processMessage(message: MetaInboundMessage, deps: MetaWebhookJobDeps): Promise<void> {
  const { env } = deps;
  let supplier: MetaSupplier = null;

  if (message.source === "instagram" && configured(env.accessToken)) {
    supplier = await deps.resolveSupplier(deps.lookup, message.senderId, env.accessToken);
    if (supplier !== null) {
      const outcome = await deps.inbound(
        deps.store,
        {
          kind: "message",
          messageId: message.eventId,
          senderId: message.senderId,
          text: message.text,
          supplierId: supplier.id,
          channel: "instagram",
        },
        { keyword: env.keyword, now: deps.now() },
      );
      // Opt-out determinístico (isOptOut em handleInbound): marca e NÃO responde.
      if (outcome.recorded && outcome.action.action === "opt_out") {
        await deps.markOptOut(deps.respondDb, outcome.conversation.id, supplier.id);
      } else if (
        deps.shouldRespond(outcome) &&
        configured(env.accessToken) &&
        configured(env.igBusinessId)
      ) {
        const history = await deps.loadHistory(deps.respondDb, outcome.conversation.id);
        await deps.respond({
          client: deps.getClient(),
          context: { category: supplier.category },
          history,
          ports: deps.buildPorts({
            db: deps.respondDb,
            message: { channel: "instagram", instagramBusinessId: env.igBusinessId, accessToken: env.accessToken },
            recipientId: message.senderId,
          }),
          conversationId: outcome.conversation.id,
          supplierId: supplier.id,
        });
      }
    }
  }

  // Messenger: PSID não mapeia para @handle; atende a DM e o agente pede a identificação.
  if (
    message.source === "messenger" &&
    supplier === null &&
    configured(env.accessToken) &&
    configured(env.pageId)
  ) {
    const outcome = await deps.inbound(
      deps.store,
      {
        kind: "message",
        messageId: message.eventId,
        senderId: message.senderId,
        text: message.text,
        supplierId: null,
        channel: "messenger",
      },
      { keyword: env.keyword, now: deps.now() },
    );
    if (outcome.recorded && outcome.action.action === "opt_out") {
      await deps.markOptOut(deps.respondDb, outcome.conversation.id, null);
    } else if (deps.shouldRespond(outcome)) {
      const history = await deps.loadHistory(deps.respondDb, outcome.conversation.id);
      await deps.respond({
        client: deps.getClient(),
        context: { category: "evento", supplierKnown: false },
        history,
        ports: deps.buildPorts({
          db: deps.respondDb,
          message: { channel: "messenger", pageId: env.pageId, accessToken: env.accessToken },
          recipientId: message.senderId,
        }),
        conversationId: outcome.conversation.id,
        supplierId: null,
      });
    }
  }
}

async function processComment(comment: MetaCommentEvent, deps: MetaWebhookJobDeps): Promise<void> {
  const { env } = deps;
  const supplier = await deps.resolveSupplierByHandle(deps.lookup, comment.senderUsername);
  if (supplier !== null) {
    const outcome = await deps.inbound(
      deps.store,
      {
        kind: "comment",
        commentId: comment.commentId,
        senderId: comment.senderId,
        text: comment.text,
        supplierId: supplier.id,
        channel: "instagram",
      },
      { keyword: env.keyword, now: deps.now() },
    );
    // Comentário com a palavra-chave: envia a DM de abertura (1x, 7 dias).
    if (
      outcome.recorded &&
      outcome.action.action === "private_reply" &&
      configured(env.accessToken) &&
      configured(env.igBusinessId)
    ) {
      const sent = await deps.sendReply({
        igUserId: env.igBusinessId,
        accessToken: env.accessToken,
        commentId: comment.commentId,
        text: PRIVATE_REPLY_OPENER,
      });
      if (!sent.ok) logger.warn({ error: sent.error }, "falha ao enviar private reply");
    }
  }
}

/**
 * Processa um evento do Meta registrado em `webhook_events`.
 * Idempotente: se o evento já foi processado, retorna sem efeito. Erros são
 * propagados para o BullMQ repetir (o `handleInbound` já deduplica a gravação
 * da mensagem por `external_id`).
 */
export async function handleMetaWebhookJob(
  data: MetaWebhookJobData,
  deps: MetaWebhookJobDeps = defaultMetaWebhookJobDeps(),
): Promise<void> {
  const externalEventId = externalEventIdOf(data);

  const existing = await loadWebhookEvent(deps.webhookEvents, externalEventId);
  if (existing !== null && existing.status === "processed") {
    logger.info({ externalEventId }, "webhook meta já processado — ignorando");
    return;
  }

  if (data.kind === "message") {
    await processMessage(data.event as MetaInboundMessage, deps);
  } else {
    await processComment(data.event as MetaCommentEvent, deps);
  }

  await updateWebhookEventStatus(deps.webhookEvents, externalEventId, "processed");
}

/** Marca o evento como falho após esgotar as tentativas do BullMQ. */
export async function markMetaWebhookFailed(
  data: MetaWebhookJobData,
  deps: MetaWebhookJobDeps = defaultMetaWebhookJobDeps(),
): Promise<void> {
  await updateWebhookEventStatus(deps.webhookEvents, externalEventIdOf(data), "failed");
}
