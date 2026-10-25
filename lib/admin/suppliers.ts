import { z } from "zod";

/** Fornecedor bloqueado para busca/contato: pediu para sair OU foi excluído pelo admin (lixeira). */
export function supplierBlockedAt(s: { opt_out_at?: string | null; deleted_at?: string | null } | null | undefined): string | null {
  return s?.opt_out_at ?? s?.deleted_at ?? null;
}

type Res = { error: { message: string } | null };
interface UpdateQ extends PromiseLike<Res> {
  eq(c: string, v: unknown): UpdateQ;
  is(c: string, v: unknown): UpdateQ;
}
export interface SupplierDb { from(t: "suppliers"): { update(v: Record<string, unknown>): UpdateQ } }

export type OpResult = { ok: true } | { ok: false; error: string };

/** "Excluir fornecedor": exclusão recuperável (deleted_at/deleted_by). Só marca quem ainda não está na lixeira. */
export async function softDeleteSupplier(db: SupplierDb, supplierId: unknown, adminId: string, now = new Date()): Promise<OpResult> {
  if (!z.string().uuid().safeParse(supplierId).success) return { ok: false, error: "Fornecedor inválido" };
  const { error } = await db.from("suppliers").update({ deleted_at: now.toISOString(), deleted_by: adminId }).eq("id", supplierId).is("deleted_at", null);
  return error ? { ok: false, error: "Não foi possível excluir. Tente de novo." } : { ok: true };
}
