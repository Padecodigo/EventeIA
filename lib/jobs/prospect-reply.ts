import "server-only";

import { getDeepSeekClient } from "@/lib/deepseek/client";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { assertBusinessHours } from "@/lib/outreach/business-defer";
import { createSupabaseSupplierConversationStore, mirrorOutboundMessage } from "@/lib/outreach/supplier-conversations";
import { createCoveragePorts } from "@/lib/prospecting/coverage-store";
import { withCoverageLoop, type CoveragePorts } from "@/lib/prospecting/coverage-turn";
import type { ConversationStatus } from "@/lib/prospecting/inbound";
import { respondToInbound } from "@/lib/prospecting/respond";
import {
  createSupabaseRespondPorts,
  defaultRespondDb,
  loadHistory,
  type MetaSendConfig,
  type RespondDb,
} from "@/lib/prospecting/supabase-respond";
import { getRedisConnection } from "@/lib/queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Resposta do agente ao fornecedor — job separado do webhook para permitir
 * debounce (um job por conversa, com delay) e rate-limit por conversa.
 *
 * Re-checa o status da conversa (pula se `opted_out`), adquire um lock Redis
 * (SET NX PX) por conversa e aplica um teto horário de respostas; acima do teto
 * escala ao humano em vez de responder.
 */

export interface ProspectReplyJobData {
  conversationId: string;
  channel: "instagram" | "messenger";
  recipientId: string;
  supplierId: string | null;
  category: string;
  supplierKnown?: boolean;
}

export interface ProspectReplyRedis {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  /** SET key value PX ttlMs NX → "OK" quando adquiriu, null quando já existia. */
  set(key: string, value: string, ttlMs: number): Promise<"OK" | null>;
  del(key: string): Promise<unknown>;
}

export interface ProspectReplyJobDeps {
  env: {
    accessToken?: string;
    /** Page token para Messenger; cai para accessToken se ausente. */
    pageAccessToken?: string;
    igBusinessId?: string;
    pageId?: string;
  };
  redis: () => ProspectReplyRedis;
  respondDb: RespondDb;
  loadConversationStatus: (conversationId: string) => Promise<ConversationStatus | null>;
  loadHistory: typeof loadHistory;
  respond: typeof respondToInbound;
  getClient: typeof getDeepSeekClient;
  buildPorts: typeof createSupabaseRespondPorts;
  /** P3: espelha a resposta do agente no chat do evento (só grava). */
  mirror?: (input: { channel: "instagram" | "messenger"; externalUserId: string; body: string; externalId: string | null }) => Promise<void>;
  maxRepliesPerHour?: number;
  /** Loop de cobertura item a item (0078). Ausente = desligado. */
  coverage?: (client: ReturnType<typeof getDeepSeekClient>, category: string) => CoveragePorts;
  now?: () => Date;
}

const LOCK_TTL_MS = 10_000;
const CAP_TTL_SECONDS = 3600;

function defaultRedis(): ProspectReplyRedis {
  const conn = getRedisConnection();
  return {
    incr: (key) => conn.incr(key),
    expire: (key, seconds) => conn.expire(key, seconds),
    set: (key, value, ttlMs) => conn.set(key, value, "PX", ttlMs, "NX"),
    del: (key) => conn.del(key),
  };
}

export function defaultProspectReplyJobDeps(): ProspectReplyJobDeps {
  const env = serverEnv();
  return {
    env: {
      accessToken: env.META_ACCESS_TOKEN,
      pageAccessToken: env.META_PAGE_ACCESS_TOKEN,
      igBusinessId: env.META_INSTAGRAM_BUSINESS_ID,
      pageId: env.META_PAGE_ID,
    },
    redis: () => defaultRedis(),
    respondDb: defaultRespondDb(),
    loadConversationStatus: async (conversationId) => {
      const admin = getSupabaseAdmin() as unknown as {
        from(table: "prospect_conversations"): {
          select(columns: string): {
            eq(column: string, value: string): {
              maybeSingle(): Promise<{ data: { status: ConversationStatus } | null }>;
            };
          };
        };
      };
      const { data } = await admin
        .from("prospect_conversations")
        .select("status")
        .eq("id", conversationId)
        .maybeSingle();
      return data?.status ?? null;
    },
    loadHistory,
    respond: respondToInbound,
    getClient: getDeepSeekClient,
    buildPorts: createSupabaseRespondPorts,
    mirror: async (input) => {
      await mirrorOutboundMessage(createSupabaseSupplierConversationStore(), { ...input, author: "agent" });
    },
    coverage: (client, category) => createCoveragePorts({ client, category }),
  };
}

export function messageConfig(data: ProspectReplyJobData, env: ProspectReplyJobDeps["env"]): MetaSendConfig {
  return data.channel === "messenger"
    ? { channel: "messenger", pageId: env.pageId ?? "", accessToken: env.pageAccessToken || env.accessToken || "" }
    : {
        channel: "instagram",
        instagramBusinessId: env.igBusinessId ?? "",
        accessToken: env.accessToken ?? "",
      };
}

export async function handleProspectReplyJob(
  data: ProspectReplyJobData,
  deps: ProspectReplyJobDeps = defaultProspectReplyJobDeps(),
): Promise<void> {
  // Antes de qualquer efeito: fora de dia útil 09–18 BRT o job é adiado.
  assertBusinessHours((deps.now ?? (() => new Date()))());
  const status = await deps.loadConversationStatus(data.conversationId);
  if (status === null) return;
  if (status === "opted_out") {
    logger.info({ conversationId: data.conversationId }, "prospecção: conversa optada-fora — resposta ignorada");
    return;
  }

  const redis = deps.redis();
  const lockKey = `eventeia:prospect-reply:lock:${data.conversationId}`;
  const acquired = await redis.set(lockKey, "1", LOCK_TTL_MS);
  if (acquired !== "OK") {
    logger.info({ conversationId: data.conversationId }, "prospecção: resposta já em andamento — ignorando");
    return;
  }

  try {
    const capKey = `eventeia:prospect-reply:cap:${data.conversationId}`;
    const count = await redis.incr(capKey);
    if (count === 1) await redis.expire(capKey, CAP_TTL_SECONDS);

    const ports = deps.buildPorts({
      db: deps.respondDb,
      message: messageConfig(data, deps.env),
      recipientId: data.recipientId,
      ...(deps.mirror !== undefined
        ? {
            mirror: (text: string, messageId: string | null) =>
              deps.mirror!({ channel: data.channel, externalUserId: data.recipientId, body: text, externalId: messageId }),
          }
        : {}),
    });

    const max = deps.maxRepliesPerHour ?? 6;
    if (count > max) {
      await ports.escalate(data.conversationId, "limite de respostas por hora excedido");
      return;
    }

    const history = await deps.loadHistory(deps.respondDb, data.conversationId);
    const client = deps.getClient();
    const replyPorts =
      deps.coverage === undefined
        ? ports
        : await withCoverageLoop({
            ports,
            coverage: deps.coverage(client, data.category),
            conversationId: data.conversationId,
            category: data.category,
            history,
          });
    await deps.respond({
      client,
      context: {
        category: data.category,
        ...(data.supplierKnown !== undefined ? { supplierKnown: data.supplierKnown } : {}),
      },
      history,
      ports: replyPorts,
      conversationId: data.conversationId,
      supplierId: data.supplierId,
    });
  } finally {
    await redis.del(lockKey);
  }
}
