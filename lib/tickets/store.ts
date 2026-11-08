import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

import { isAvailableTicket, ticketCreditIdempotencyKey } from "./pure";

export type TicketDb = SupabaseClient<Database>;

export interface AvailableTicket {
  id: string;
  amountCents: number;
  createdAt: string;
}

export interface CreatePendingTicketInput {
  ownerProfileId: string;
  /** id textual da cobrança Asaas (payments.asaas_payment_id). */
  paymentId: string;
  amountCents: number;
}

/**
 * Tíquete avulso — acesso service_role. Cada função recebe o client (default:
 * getSupabaseAdmin()) para permitir teste com banco mockado, sem I/O real.
 */

export async function listAvailableTickets(
  ownerProfileId: string,
  db: TicketDb = getSupabaseAdmin(),
): Promise<AvailableTicket[]> {
  const { data } = await db
    .from("ticket_purchases")
    .select("id,amount_cents,created_at,status,event_id")
    .eq("owner_profile_id", ownerProfileId)
    .order("created_at", { ascending: true });

  return (data ?? [])
    .filter((row) => isAvailableTicket({ status: row.status, event_id: row.event_id }))
    .map((row) => ({ id: row.id, amountCents: row.amount_cents, createdAt: row.created_at }));
}

/**
 * Consome atomicamente o ticket ativo MAIS ANTIGO sem evento, vinculando-o ao
 * evento. Retorna o id consumido ou null quando não há ticket disponível.
 * A atomicidade vive na função SQL `consume_available_ticket` (0085).
 */
export async function consumeAvailableTicket(
  ownerProfileId: string,
  eventId: string,
  db: TicketDb = getSupabaseAdmin(),
): Promise<string | null> {
  const { data, error } = await db.rpc("consume_available_ticket", {
    p_owner: ownerProfileId,
    p_event: eventId,
  });

  if (error !== null) {
    throw new Error(`consume_available_ticket falhou: ${error.message}`);
  }

  return typeof data === "string" ? data : null;
}

/**
 * Registra o tíquete avulso como pendente, com chave de idempotência derivada da
 * cobrança Asaas (1 tíquete por cobrança). Repetições com a mesma cobrança são
 * no-ops auditáveis.
 */
export async function createPendingTicket(
  input: CreatePendingTicketInput,
  db: TicketDb = getSupabaseAdmin(),
): Promise<string | null> {
  const { data, error } = await db
    .from("ticket_purchases")
    .insert({
      owner_profile_id: input.ownerProfileId,
      status: "pending",
      event_id: null,
      payment_id: input.paymentId,
      amount_cents: input.amountCents,
      idempotency_key: ticketCreditIdempotencyKey(input.paymentId),
    })
    .select("id")
    .maybeSingle();

  if (error !== null) {
    throw new Error(`ticket_purchases insert falhou: ${error.message}`);
  }

  return data?.id ?? null;
}
