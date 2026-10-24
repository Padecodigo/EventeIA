import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./supabase/types";

/**
 * Emissão de eventos de sistema (feed canônico — ver .context/FEEDS.md).
 * Em fluxos financeiros, o feed é gravado na MESMA transação do efeito
 * (função SQL process_payment_webhook). Este helper cobre eventos não-financeiros.
 */
export interface FeedEventInput {
  type: string;
  actorType: "user" | "system" | "webhook" | "admin";
  actorId?: string | null;
  aggregateType: string;
  aggregateId: string;
  payload?: Json;
  correlationId: string;
  source: "app" | "worker" | "webhook";
}

export async function emitFeed(
  client: SupabaseClient<Database>,
  input: FeedEventInput,
): Promise<void> {
  const { error } = await client.from("system_events").insert({
    type: input.type,
    occurred_at: new Date().toISOString(),
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    aggregate_type: input.aggregateType,
    aggregate_id: input.aggregateId,
    payload: input.payload ?? {},
    correlation_id: input.correlationId,
    source: input.source,
    schema_version: 1,
  });

  if (error !== null) {
    throw new Error(`Falha ao emitir feed ${input.type}: ${error.message}`);
  }
}
