"use server";

import { revalidatePath } from "next/cache";

import { parseTrashKind, restoreItems, type TrashDb } from "@/lib/admin/trash";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Restaura itens da lixeira (um ou todos de uma seção). Somente admin. */
export async function restoreAction(form: FormData): Promise<void> {
  await requireAdmin();
  const kind = parseTrashKind(form.get("kind"));
  if (kind === null) return;
  // Tipagem genérica do PostgREST é profunda demais; a interface mínima basta aqui.
  const db = getSupabaseAdmin() as unknown as TrashDb;
  await restoreItems(db, kind, form.getAll("id"));
  for (const p of ["/admin/lixeira", "/admin/custos", "/admin/financeiro", "/admin/consumo", "/admin/chamados"]) revalidatePath(p);
}
