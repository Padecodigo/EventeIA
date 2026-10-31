import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type {
  Channel,
  ConversationStatus,
  ProspectConversation,
  ProspectStore,
} from "./inbound";

/**
 * Adapter Supabase da porta `ProspectStore`.
 *
 * Os tipos gerados (`lib/supabase/types.ts`) ainda não conhecem as tabelas da
 * migração 0053, então o client é acessado por uma interface mínima. Some quando
 * `supabase gen types` rodar com a 0053 aplicada.
 */

interface Row {
  id: string;
  status: ConversationStatus;
}

interface ProspectDb {
  from(table: "prospect_conversations"): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{ data: Row | null }>;
        };
      };
    };
    insert(values: Record<string, unknown>): {
      select(columns: string): { single(): Promise<{ data: Row | null }> };
    };
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ): {
      select(columns: string): { single(): Promise<{ data: Row | null }> };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: { code?: string } | null }>;
    };
  };
  from(table: "prospect_messages"): {
    insert(values: Record<string, unknown>): Promise<{ error: { code?: string } | null }>;
  };
}

const UNIQUE_VIOLATION = "23505";

export function createSupabaseProspectStore(
  db: ProspectDb = getSupabaseAdmin() as unknown as ProspectDb,
): ProspectStore {
  return {
    async findConversation(channel: Channel, externalUserId: string): Promise<ProspectConversation | null> {
      const { data } = await db
        .from("prospect_conversations")
        .select("id,status")
        .eq("channel", channel)
        .eq("external_user_id", externalUserId)
        .maybeSingle();
      return data === null ? null : { id: data.id, status: data.status };
    },

    async createConversation(input): Promise<ProspectConversation> {
      // Upsert atômico por (channel, external_user_id): em criação concorrente
      // (find→create race), o segundo create resolve para a MESMA linha em vez
      // de estourar unique violation 23505.
      const { data } = await db
        .from("prospect_conversations")
        .upsert(
          {
            supplier_id: input.supplierId,
            channel: input.channel,
            external_user_id: input.externalUserId,
          },
          { onConflict: "channel,external_user_id", ignoreDuplicates: false },
        )
        .select("id,status")
        .single();
      if (data === null) throw new Error("falha ao criar conversa");
      return { id: data.id, status: data.status };
    },

    async insertMessage(input): Promise<boolean> {
      const { error } = await db.from("prospect_messages").insert({
        conversation_id: input.conversationId,
        direction: input.direction,
        body: input.body,
        external_id: input.externalId,
      });
      if (error !== null) {
        if (error.code === UNIQUE_VIOLATION) return false; // evento já gravado
        throw new Error(`falha ao gravar mensagem (${error.code ?? "?"})`);
      }
      return true;
    },

    async updateConversation(id, patch): Promise<void> {
      const values: Record<string, unknown> = {};
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.lastInboundAt !== undefined) values.last_inbound_at = patch.lastInboundAt.toISOString();
      if (Object.keys(values).length === 0) return;
      await db.from("prospect_conversations").update(values).eq("id", id);
    },
  };
}
