import { z } from "zod";

/** Edição e exclusão do PRÓPRIO chamado pelo usuário (RPCs 0047, que checam auth.uid() no banco). */

export const OWNER_EDITABLE_STATUSES = ["aberto", "em_andamento"] as const;
export function ownerCanEdit(status: string, deletedAt?: string | null): boolean {
  return !deletedAt && (OWNER_EDITABLE_STATUSES as readonly string[]).includes(status);
}

export const ownerEditSchema = z.object({
  ticketId: z.string().uuid(),
  subject: z.string().trim().min(3, "Assunto muito curto").max(140),
  message: z.string().trim().min(10, "Conte um pouco mais (mín. 10 caracteres)").max(5000),
});

type RpcRes = { data: unknown; error: { message: string; code?: string } | null };
export interface OwnerRpc {
  rpc(fn: "support_ticket_owner_edit", args: { p_ticket_id: string; p_subject: string; p_message: string }): PromiseLike<RpcRes>;
  rpc(fn: "support_ticket_owner_delete", args: { p_ticket_id: string }): PromiseLike<RpcRes>;
}

export type OwnerResult = { ok: true; ticketId: string } | { ok: false; error: string };
const DENIED = "Não foi possível alterar este chamado. Ele pode estar encerrado ou não ser seu.";

export async function editOwnTicket(db: OwnerRpc, input: Record<string, unknown>): Promise<OwnerResult> {
  const parsed = ownerEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const { ticketId, subject, message } = parsed.data;
  const { data, error } = await db.rpc("support_ticket_owner_edit", { p_ticket_id: ticketId, p_subject: subject, p_message: message });
  if (error || data !== true) return { ok: false, error: DENIED };
  return { ok: true, ticketId };
}

export async function deleteOwnTicket(db: OwnerRpc, ticketId: unknown): Promise<OwnerResult> {
  const id = z.string().uuid().safeParse(ticketId);
  if (!id.success) return { ok: false, error: "Chamado inválido" };
  const { data, error } = await db.rpc("support_ticket_owner_delete", { p_ticket_id: id.data });
  if (error || data !== true) return { ok: false, error: DENIED };
  return { ok: true, ticketId: id.data };
}
