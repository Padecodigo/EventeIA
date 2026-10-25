/** Lixeira do admin: itens com exclusão lógica (deleted_at) e restauração. Nada é apagado de verdade. */
export const TRASH_KINDS = {
  custos: { table: "cost_entries", label: "Custos (variáveis e fixos)" },
  ia: { table: "llm_usage_events", label: "Custos de IA (LLM)" },
  alertas: { table: "finance_alerts", label: "Alertas de saldo" },
  chamados: { table: "support_tickets", label: "Chamados" },
} as const;
export type TrashKind = keyof typeof TRASH_KINDS;

export function parseTrashKind(v: unknown): TrashKind | null {
  return typeof v === "string" && Object.hasOwn(TRASH_KINDS, v) ? (v as TrashKind) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cleanIds(ids: readonly unknown[]): string[] {
  return [...new Set(ids.filter((v): v is string => typeof v === "string" && UUID.test(v)))].slice(0, 500);
}

type UpdateQ = { in: (c: string, v: string[]) => UpdateQ; not: (c: string, op: string, v: null) => PromiseLike<{ error: { message: string } | null }> };
export interface TrashDb {
  from: (t: string) => { update: (p: Record<string, null>) => UpdateQ };
}

/** Restaura (deleted_at/deleted_by = null) somente linhas que estão na lixeira. */
export async function restoreItems(db: TrashDb, kind: TrashKind, ids: readonly unknown[]): Promise<number> {
  const clean = cleanIds(ids);
  if (clean.length === 0) return 0;
  const { error } = await db
    .from(TRASH_KINDS[kind].table)
    .update({ deleted_at: null, deleted_by: null })
    .in("id", clean)
    .not("deleted_at", "is", null);
  if (error) throw new Error(error.message);
  return clean.length;
}
