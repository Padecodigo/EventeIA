import { z } from "zod";

/** Filtro rápido da lista do admin: abertos (tudo que não foi encerrado), encerrados ou todos. */
export const TICKET_SITUATIONS = ["abertos", "encerrados", "todos"] as const;
export type TicketSituation = (typeof TICKET_SITUATIONS)[number];
export const SITUATION_LABELS: Record<TicketSituation, string> = { abertos: "Abertos", encerrados: "Encerrados", todos: "Todos" };

export function parseSituation(raw: unknown): TicketSituation {
  return TICKET_SITUATIONS.includes(raw as TicketSituation) ? (raw as TicketSituation) : "abertos";
}

const idSchema = z.string().uuid();

type Res = { data: unknown; error: { code?: string } | null };
// Builder mínimo do supabase-js usado aqui (facilita o teste).
interface Builder extends PromiseLike<Res> {
  update(v: Record<string, unknown>): Builder;
  eq(c: string, v: unknown): Builder;
  is(c: string, v: unknown): Builder;
  neq(c: string, v: unknown): Builder;
}
export interface TicketDb { from(t: "support_tickets"): Builder }

export type OpResult = { ok: true } | { ok: false; error: string };

async function run(b: Builder): Promise<OpResult> {
  const { error } = await b;
  return error ? { ok: false, error: "Não foi possível salvar. Tente de novo." } : { ok: true };
}

/** Encerra: status 'fechado' + quem e quando. Só chamados não excluídos e ainda não encerrados. */
export function closeTicket(db: TicketDb, ticketId: unknown, adminId: string, now = new Date()): Promise<OpResult> {
  if (!idSchema.safeParse(ticketId).success) return Promise.resolve({ ok: false, error: "Chamado inválido" });
  return run(
    db.from("support_tickets")
      .update({ status: "fechado", closed_at: now.toISOString(), closed_by: adminId })
      .eq("id", ticketId).is("deleted_at", null).neq("status", "fechado"),
  );
}

/** Reabre um chamado encerrado: volta para 'aberto' e limpa quem/quando encerrou. */
export function reopenTicket(db: TicketDb, ticketId: unknown): Promise<OpResult> {
  if (!idSchema.safeParse(ticketId).success) return Promise.resolve({ ok: false, error: "Chamado inválido" });
  return run(
    db.from("support_tickets")
      .update({ status: "aberto", closed_at: null, closed_by: null })
      .eq("id", ticketId).is("deleted_at", null).eq("status", "fechado"),
  );
}

/** Exclusão recuperável: só marca deleted_at/deleted_by (mensagens e anexo ficam guardados). */
export function softDeleteTicket(db: TicketDb, ticketId: unknown, adminId: string, now = new Date()): Promise<OpResult> {
  if (!idSchema.safeParse(ticketId).success) return Promise.resolve({ ok: false, error: "Chamado inválido" });
  return run(
    db.from("support_tickets")
      .update({ deleted_at: now.toISOString(), deleted_by: adminId })
      .eq("id", ticketId).is("deleted_at", null),
  );
}
