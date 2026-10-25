"use server";

import { revalidatePath } from "next/cache";

import { softDeleteSupplier, type OpResult, type SupplierDb } from "@/lib/admin/suppliers";
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
