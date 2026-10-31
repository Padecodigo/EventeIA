import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { SupplierConversationStatus } from "./send-guard";
import { eventIdFromRef, windowExpiresAt, type WindowKind } from "./window";

/**
 * Persistência das conversas de fornecedor (supplier_conversations) + ingestão de
 * mensagens recebidas e varredura de janelas expiradas.
 *
 * Os tipos gerados (`lib/supabase/types.ts`) conhecem as tabelas, mas o client é
 * acessado por uma interface mínima injetável para manter o módulo testável sem
 * Redis/Supabase reais.
 */

export type Channel = "instagram" | "messenger";

export interface SupplierConversationRecord {
  id: string;
  channel: Channel;
  externalUserId: string;
  eventId: string | null;
  supplierId: string | null;
  ref: string | null;
  lastInboundAt: string | null;
  windowExpiresAt: string | null;
  windowKind: WindowKind;
  status: SupplierConversationStatus;
}

interface ConversationRow {
  id: string;
  event_id: string | null;
  supplier_id: string | null;
  ref: string | null;
  last_inbound_at: string | null;
  window_expires_at: string | null;
  window_kind: WindowKind;
  status: SupplierConversationStatus;
}

interface SupplierConversationDb {
  from(table: "supplier_conversations"): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{ data: ConversationRow | null }>;
        };
      };
    };
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ): {
      select(columns: string): { single(): Promise<{ data: ConversationRow | null }> };
    };
  };
  from(table: "supplier_conversation_messages"): {
    insert(values: Record<string, unknown>): Promise<{ error: { code?: string } | null }>;
  };
}

const UNIQUE_VIOLATION = "23505";

function toRecord(
  row: ConversationRow,
  channel: Channel,
  externalUserId: string,
): SupplierConversationRecord {
  return {
    id: row.id,
    channel,
    externalUserId,
    eventId: row.event_id,
    supplierId: row.supplier_id,
    ref: row.ref,
    lastInboundAt: row.last_inbound_at,
    windowExpiresAt: row.window_expires_at,
    windowKind: row.window_kind,
    status: row.status,
  };
}

export interface SupplierConversationStore {
  find(channel: Channel, externalUserId: string): Promise<SupplierConversationRecord | null>;
  upsert(input: {
    channel: Channel;
    externalUserId: string;
    eventId?: string | null;
    supplierId?: string | null;
    ref?: string | null;
    windowKind: WindowKind;
    windowExpiresAt: Date;
    lastInboundAt: Date;
    status?: SupplierConversationStatus;
  }): Promise<SupplierConversationRecord>;
  insertMessage(input: {
    conversationId: string;
    direction: "in" | "out";
    body: string;
    externalId?: string | null;
    moderated?: boolean;
  }): Promise<boolean>;
}

export function createSupabaseSupplierConversationStore(
  db: SupplierConversationDb = getSupabaseAdmin() as unknown as SupplierConversationDb,
): SupplierConversationStore {
  return {
    async find(channel, externalUserId) {
      const { data } = await db
        .from("supplier_conversations")
        .select("id,event_id,supplier_id,ref,last_inbound_at,window_expires_at,window_kind,status")
        .eq("channel", channel)
        .eq("external_user_id", externalUserId)
        .maybeSingle();
      if (data === null) return null;
      return toRecord(data, channel, externalUserId);
    },

    async upsert(input) {
      const values = {
        channel: input.channel,
        external_user_id: input.externalUserId,
        event_id: input.eventId ?? null,
        supplier_id: input.supplierId ?? null,
        ref: input.ref ?? null,
        window_kind: input.windowKind,
        window_expires_at: input.windowExpiresAt.toISOString(),
        last_inbound_at: input.lastInboundAt.toISOString(),
        ...(input.status !== undefined ? { status: input.status } : {}),
      };
      const { data } = await db
        .from("supplier_conversations")
        .upsert(values, { onConflict: "channel,external_user_id", ignoreDuplicates: false })
        .select("id,event_id,supplier_id,ref,last_inbound_at,window_expires_at,window_kind,status")
        .single();
      if (data === null) throw new Error("falha ao criar/atualizar conversa de fornecedor");
      return toRecord(data, input.channel, input.externalUserId);
    },

    async insertMessage(input) {
      const { error } = await db.from("supplier_conversation_messages").insert({
        conversation_id: input.conversationId,
        direction: input.direction,
        body: input.body,
        moderated: input.moderated ?? false,
        external_id: input.externalId ?? null,
      });
      if (error !== null) {
        if (error.code === UNIQUE_VIOLATION) return false; // evento já gravado
        throw new Error(`falha ao gravar mensagem de fornecedor (${error.code ?? "?"})`);
      }
      return true;
    },
  };
}

export interface SupplierMessageIngestInput {
  channel: Channel;
  externalUserId: string;
  ref: string | null;
  windowKind: WindowKind;
  body: string;
  externalId: string;
  eventId?: string | null;
  supplierId?: string | null;
  now: Date;
}

/**
 * Ingere uma mensagem recebida: resolve/atualiza a conversa (upsert atômico por
 * canal+remetente), reabre a janela a partir de agora e grava a mensagem. O `ref`
 * vincula a conversa ao evento quando presente (`event:<id>`).
 */
export async function ingestSupplierMessage(
  store: SupplierConversationStore,
  input: SupplierMessageIngestInput,
): Promise<{ conversationId: string; recorded: boolean }> {
  const existing = await store.find(input.channel, input.externalUserId);
  const expiresAt = windowExpiresAt(input.windowKind, input.now);

  const conversation = await store.upsert({
    channel: input.channel,
    externalUserId: input.externalUserId,
    eventId: input.eventId ?? eventIdFromRef(input.ref) ?? existing?.eventId ?? null,
    supplierId: input.supplierId ?? existing?.supplierId ?? null,
    ref: input.ref ?? existing?.ref ?? null,
    windowKind: input.windowKind,
    windowExpiresAt: expiresAt,
    lastInboundAt: input.now,
    status: existing !== null && existing.status === "opted_out" ? "opted_out" : "open",
  });

  const recorded = await store.insertMessage({
    conversationId: conversation.id,
    direction: "in",
    body: input.body,
    externalId: input.externalId,
  });

  return { conversationId: conversation.id, recorded };
}

export interface WindowSweepDb {
  from(table: "supplier_conversations"): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): {
        lt(column: string, value: string): {
          select(columns: string): Promise<{ data: { id: string }[] | null }>;
        };
      };
    };
  };
}

/** Marca `canal_fechado` as conversas abertas com janela já vencida. Retorna o total. */
export async function markExpiredWindows(
  db: WindowSweepDb,
  now: Date = new Date(),
): Promise<number> {
  const { data } = await db
    .from("supplier_conversations")
    .update({ status: "canal_fechado" })
    .eq("status", "open")
    .lt("window_expires_at", now.toISOString())
    .select("id");
  return data?.length ?? 0;
}

export interface SilentSelectionSweepDb {
  from(table: "supplier_conversations"): {
    select(columns: string): {
      lt(column: string, value: string): Promise<{ data: { id: string }[] | null }>;
    };
  };
  from(table: "supplier_selections"): {
    update(values: Record<string, unknown>): {
      in(column: string, values: string[]): {
        in(column: string, values: string[]): {
          select(columns: string): Promise<{ data: { id: string }[] | null; error: { code?: string } | null }>;
        };
      };
    };
  };
}

/**
 * Silêncio do fornecedor: seleção já enviada cuja janela venceu sem resposta
 * vira `indisponivel` (o usuário segue com outro fornecedor). Retorna o total.
 */
export async function markSilentSupplierSelections(
  db: SilentSelectionSweepDb,
  now: Date = new Date(),
): Promise<number> {
  const { data: expired } = await db
    .from("supplier_conversations")
    .select("id")
    .lt("window_expires_at", now.toISOString());
  const conversationIds = (expired ?? []).map((conversation) => conversation.id);
  if (conversationIds.length === 0) return 0;

  const { data, error } = await db
    .from("supplier_selections")
    .update({ status: "indisponivel", updated_at: now.toISOString() })
    .in("conversation_id", conversationIds)
    .in("status", ["enviado_ao_fornecedor", "aguardando_resposta"])
    .select("id");
  if (error !== null) {
    throw new Error(`falha ao marcar seleções em silêncio (${error.code ?? "?"})`);
  }
  return data?.length ?? 0;
}

/** Varredura em produção: usa o client admin (service_role) do Supabase. */
export async function runSupplierWindowSweep(now: Date = new Date()): Promise<number> {
  const admin = getSupabaseAdmin();
  const closed = await markExpiredWindows(admin as unknown as WindowSweepDb, now);
  await markSilentSupplierSelections(admin as unknown as SilentSelectionSweepDb, now);
  return closed;
}
