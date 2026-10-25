"use server";

import { revalidatePath } from "next/cache";

import {
  TRASH_KINDS,
  parseTrashKind,
  purgeConfirmed,
  purgeItems,
  purgeSummary,
  restoreItems,
  type PurgeDb,
  type PurgeResult,
  type TrashDb,
  type TrashKind,
} from "@/lib/admin/trash";
import { requireAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const PATHS = ["/admin/lixeira", "/admin/custos", "/admin/financeiro", "/admin/consumo", "/admin/chamados", "/admin/fornecedores"];

/** Restaura itens da lixeira (um ou todos de uma seção). Somente admin. */
export async function restoreAction(form: FormData): Promise<void> {
  await requireAdmin();
  const kind = parseTrashKind(form.get("kind"));
  if (kind === null) return;
  // Tipagem genérica do PostgREST é profunda demais; a interface mínima basta aqui.
  const db = getSupabaseAdmin() as unknown as TrashDb;
  await restoreItems(db, kind, form.getAll("id"));
  for (const p of PATHS) revalidatePath(p);
}

export type PurgeState = { ok: boolean; message: string } | null;

/**
 * Exclusão DEFINITIVA (item ou "Esvaziar lixeira"). Exige digitar EXCLUIR.
 * kind = "all" esvazia todas as seções; custos (fiscais) são sempre mantidos.
 */
export async function purgeAction(_prev: PurgeState, form: FormData): Promise<PurgeState> {
  const admin = await requireAdmin();
  if (!purgeConfirmed(form.get("confirm"))) return { ok: false, message: "Digite EXCLUIR para confirmar a exclusão definitiva." };
  const rawKind = form.get("kind");
  const kinds: TrashKind[] = rawKind === "all" ? (Object.keys(TRASH_KINDS) as TrashKind[]) : [parseTrashKind(rawKind)].filter((k): k is TrashKind => k !== null);
  if (kinds.length === 0) return { ok: false, message: "Seção inválida." };
  const ids = rawKind === "all" || form.get("scope") === "all" ? "all" : form.getAll("id");
  const supabase = getSupabaseAdmin();
  const db = supabase as unknown as PurgeDb;
  const results: PurgeResult[] = [];
  try {
    for (const k of kinds) results.push(await purgeItems(db, k, ids, admin.id));
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error), adminId: admin.id }, "lixeira: falha na exclusão definitiva");
    return { ok: false, message: "Não foi possível excluir agora. Nada além do que já foi informado foi apagado; tente de novo." };
  }
  const files = results.flatMap((r) => r.attachments);
  if (files.length) {
    const { error } = await supabase.storage.from("support-attachments").remove(files);
    if (error) logger.warn({ count: files.length }, "lixeira: anexos não removidos do storage");
  }
  logger.info({ adminId: admin.id, results: results.map(({ kind, deleted, skipped }) => ({ kind, deleted, skipped })) }, "lixeira: exclusão definitiva");
  for (const p of PATHS) revalidatePath(p);
  return { ok: true, message: purgeSummary(results) };
}
