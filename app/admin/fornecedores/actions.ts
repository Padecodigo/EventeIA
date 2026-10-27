"use server";

import { revalidatePath } from "next/cache";

import {
  SUPPLIERS_CLEAR_CONFIRMATION,
  isSuppliersClearConfirmed,
  softDeleteAllSuppliers,
  softDeleteSupplier,
  type OpResult,
  type SupplierDb,
} from "@/lib/admin/suppliers";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** "Excluir fornecedor" (recuperável): sai das listas, da busca e dos contatos; vai para a Lixeira. */
export async function deleteSupplierAction(_prev: OpResult | null, form: FormData): Promise<OpResult> {
  const admin = await requireAdmin();
  // Tipagem genérica do PostgREST é profunda demais; a interface mínima basta aqui.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const db = getSupabaseAdmin() as unknown as SupplierDb;
  const res = await softDeleteSupplier(db, form.get("supplierId"), admin.id);
  if (res.ok) {
    revalidatePath("/admin/fornecedores");
    const id = form.get("supplierId");
    if (typeof id === "string") revalidatePath(`/admin/fornecedores/${id}`);
    revalidatePath("/admin/lixeira");
  }
  return res;
}

export interface SupplierClearState {
  error?: string;
  success?: string;
}

/**
 * Limpa a lista de fornecedores: todos vão para a Lixeira de uma vez.
 * Confirmação digitada porque a ação atinge todos os registros vivos.
 */
export async function clearSuppliersAction(
  _prev: SupplierClearState,
  form: FormData,
): Promise<SupplierClearState> {
  const admin = await requireAdmin();
  if (!isSuppliersClearConfirmed(form.get("confirm"))) {
    return { error: `Digite ${SUPPLIERS_CLEAR_CONFIRMATION} para confirmar.` };
  }
  const db = getSupabaseAdmin() as unknown as SupplierDb;
  const { count } = await getSupabaseAdmin()
    .from("suppliers")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  const res = await softDeleteAllSuppliers(db, admin.id);
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/fornecedores");
  revalidatePath("/admin/lixeira");
  return { success: `${String(count ?? 0)} fornecedor(es) enviado(s) para a Lixeira.` };
}
