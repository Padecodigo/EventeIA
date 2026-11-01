import "server-only";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendPrivateReply } from "@/lib/meta/publishing";
import {
  resolveInstagramSupplier,
  resolveInstagramSupplierByHandle,
  type MetaSupplier,
  type MetaSupplierLookup,
  instagramHandleFromSid,
} from "@/lib/meta/resolve";
import type { MetaCommentEvent, MetaInboundMessage } from "@/lib/meta/webhook";
import { assertBusinessHours } from "@/lib/outreach/business-defer";
import {
  createSupabaseSupplierConversationStore,
  ingestSupplierMessage,
  type SupplierConversationStore,
} from "@/lib/outreach/supplier-conversations";
import { eventIdFromRef, windowKindFromReferral } from "@/lib/outreach/window";
import { PRIVATE_REPLY_OPENER } from "@/lib/prospecting/content";
import { eventCodesFromText } from "@/lib/prospecting/event-post";
import { createSupabaseProspectingPostStore } from "@/lib/prospecting/event-post-store";
import { handleInbound, type ProspectStore } from "@/lib/prospecting/inbound";
import { shouldAgentRespond } from "@/lib/prospecting/respond";
import {
  defaultRespondDb,
  markSupplierOptOut,
  type RespondDb,
} from "@/lib/prospecting/supabase-respond";
import { createSupabaseProspectStore } from "@/lib/prospecting/supabase-store";
import { isWithinPrivateReplyWindow } from "@/lib/prospecting/window";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { ProspectReplyJobData } from "./prospect-reply";

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
  supplierConversations: SupplierConversationStore;
  /** Resolve o evento a partir do código público do post de prospecção. */
  findEventIdByCode?: (code: string) => Promise<string | null>;
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
  enqueueReply: (data: ProspectReplyJobData) => Promise<boolean>;
  sendReply: typeof sendPrivateReply;
  now: () => Date;
  /** 0077: registra que o @ marcado já contatou (exclusão antecipada do post). */
  markPostContact?: (handle: string) => Promise<void>;
  /** @ do remetente de uma DM do Instagram (Graph API); null se não resolver. */
  handleFromSid?: (igSid: string, accessToken: string) => Promise<string | null>;
}

function configured(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

export function defaultMetaWebhookJobDeps(): MetaWebhookJobDeps {
  const admin = getSupabaseAdmin();
  const env = serverEnv();
  const prospectingPosts = createSupabaseProspectingPostStore();
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
    supplierConversations: createSupabaseSupplierConversationStore(),
    findEventIdByCode: (code) => prospectingPosts.findEventIdByCode(code),
    resolveSupplier: resolveInstagramSupplier,
    resolveSupplierByHandle: resolveInstagramSupplierByHandle,
    inbound: handleInbound,
    markOptOut: markSupplierOptOut,
    shouldRespond: shouldAgentRespond,
    enqueueReply: (data) =>
      enqueue(QUEUE_NAMES.prospectReply, "reply", { ...data }, {
        jobId: `reply_${data.conversationId}`,
        delayMs: 8000,
        removeOnComplete: true,
        removeOnFail: true,
      }),
    sendReply: sendPrivateReply,
    now: () => new Date(),
    markPostContact: async (handle) => {
      const rpc = admin as unknown as {
        rpc(fn: "mark_prospect_post_contact", args: { p_handle: string }): Promise<{ error: { code?: string } | null }>;
      };
      const { error } = await rpc.rpc("mark_prospect_post_contact", { p_handle: handle });
      if (error !== null) logger.warn({ code: error.code }, "falha ao marcar contato do post");
    },
    handleFromSid: (igSid, accessToken) => instagramHandleFromSid(igSid, accessToken),
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
    if (supplier !== null && deps.markPostContact !== undefined && deps.handleFromSid !== undefined) {
      const handle = await deps.handleFromSid(message.senderId, env.accessToken);
      if (handle !== null) await deps.markPostContact(handle);
    }
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
        // Debounce/rate-limit no job `prospect-reply` (jobId `reply_<conversa>`).
        //
        // Tetos de negócio (maxPriceCents/maxDeadlineDays) ficam undefined aqui:
        // não há coluna de orçamento/prazo ligando a conversa ao evento — o
        // `prospect_conversations` não tem `event_id` e `events` não guarda teto
        // (apenas `budget_snapshots.total_cents`, que é cena calculada, não limite).
        await deps.enqueueReply({
          conversationId: outcome.conversation.id,
          channel: "instagram",
          recipientId: message.senderId,
          supplierId: supplier.id,
          category: supplier.category,
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
      await deps.enqueueReply({
        conversationId: outcome.conversation.id,
        channel: "messenger",
        recipientId: message.senderId,
        supplierId: null,
        category: "evento",
        supplierKnown: false,
      });
    }
  }

  // Conversa de fornecedor (modelo canônico): registra a mensagem e abre/estende a
  // janela de resposta. O `ref` do link (ig.me/m.me) ou do anúncio vincula a
  // conversa ao evento quando codificado como `event:<id>`. Sem ref, o código
  // público do post de prospecção (ex.: EVT-AB12CD34) na mensagem faz o vínculo.
  let linkedEventId = eventIdFromRef(message.referral?.ref ?? null);
  if (linkedEventId === null && deps.findEventIdByCode !== undefined) {
    for (const code of eventCodesFromText(message.text)) {
      linkedEventId = await deps.findEventIdByCode(code);
      if (linkedEventId !== null) break;
    }
  }

  await ingestSupplierMessage(deps.supplierConversations, {
    channel: message.source,
    externalUserId: message.senderId,
    ref: message.referral?.ref ?? null,
    windowKind: windowKindFromReferral(message.referral?.source),
    body: message.text,
    externalId: message.eventId,
    eventId: linkedEventId,
    supplierId: supplier?.id ?? null,
    now: deps.now(),
  });
}

async function processComment(comment: MetaCommentEvent, deps: MetaWebhookJobDeps): Promise<void> {
  const { env } = deps;
  // Qualquer @ marcado que comente conta como contato (idempotente).
  if (deps.markPostContact !== undefined && comment.senderUsername.length > 0) {
    await deps.markPostContact(comment.senderUsername);
  }
  const supplier = await deps.resolveSupplierByHandle(deps.lookup, comment.senderUsername);
  if (supplier !== null) {
    // A private reply (abertura) só sai em dia útil 09–18 BRT: adia o job inteiro
    // ANTES de gravar, para que o reprocessamento ainda envie a abertura.
    assertBusinessHours(deps.now());
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
    // Comentário com a palavra-chave: envia a DM de abertura (1x por comentário,
    // até 7 dias após o comentário). "1x" vem da dedup em webhook_events; o prazo
    // de 7 dias é verificado aqui (o webhook de comentários do Instagram só entrega
    // comentários nas próprias mídias da conta — nunca em posts de terceiros).
    const createdAt =
      comment.createdTime !== undefined && comment.createdTime !== null
        ? new Date(comment.createdTime)
        : deps.now();
    if (
      outcome.recorded &&
      outcome.action.action === "private_reply" &&
      isWithinPrivateReplyWindow(createdAt, deps.now()) &&
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
