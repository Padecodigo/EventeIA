/**
 * Lixeira do admin: itens com exclusão lógica (deleted_at), restauração e exclusão definitiva.
 * Exclusão definitiva só atinge linhas que JÁ estão na lixeira (deleted_at não nulo).
 * Registros financeiros/fiscais (custos) nunca são apagados definitivamente (guarda de 5 anos).
 */
export const TRASH_KINDS = {
  custos: { table: "cost_entries", label: "Custos (variáveis e fixos)" },
  ia: { table: "llm_usage_events", label: "Custos de IA (LLM)" },
  alertas: { table: "finance_alerts", label: "Alertas de saldo" },
  chamados: { table: "support_tickets", label: "Chamados" },
  fornecedores: { table: "suppliers", label: "Fornecedores" },
} as const;
export type TrashKind = keyof typeof TRASH_KINDS;

/** Tipos que NÃO podem ser apagados definitivamente, com o motivo mostrado ao admin. */
export const PURGE_BLOCKED: Partial<Record<TrashKind, string>> = {
  custos:
    "Custos são registros financeiros/fiscais e precisam ser guardados por 5 anos (obrigação fiscal). Eles ficam na lixeira e podem ser restaurados, mas não são apagados definitivamente.",
};

export const SUPPLIER_IN_USE_REASON =
  "Fornecedores já contatados em algum evento ficam guardados (histórico de contatos e orçamentos do cliente). Eles continuam fora da busca e dos contatos.";

/**
 * Tabelas com FK para suppliers. Fornecedor referenciado em QUALQUER uma delas é mantido:
 * as FKs sem cascade (ex.: prospect_conversations) fariam o DELETE do lote inteiro falhar,
 * e as com cascade/set null apagariam ou esvaziariam histórico do cliente.
 */
export const SUPPLIER_REFERENCING_TABLES = [
  "vendor_prospects",
  "prospect_conversations",
  "prospect_quotes",
  "quotations",
  "supplier_conversations",
  "supplier_options",
  "supplier_selections",
  "contact_handoff_consents",
] as const;

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

// Builder mínimo (select/delete/insert) usado na exclusão definitiva.
type Res<T> = { data: T | null; error: { message: string } | null };
export interface PurgeQ<T = Row[]> extends PromiseLike<Res<T>> {
  in(c: string, v: string[]): PurgeQ<T>;
  not(c: string, op: string, v: null): PurgeQ<T>;
  limit(n: number): PurgeQ<T>;
}
type Row = Record<string, unknown>;
export interface PurgeDb {
  from(t: string): {
    select(cols: string): PurgeQ;
    delete(): PurgeQ;
    insert(v: Row): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface PurgeResult {
  kind: TrashKind;
  deleted: number;
  skipped: number;
  reason?: string;
  /** Anexos (storage) dos chamados apagados, para o chamador remover. */
  attachments: string[];
}

/**
 * Exclusão DEFINITIVA de itens da lixeira. `ids = "all"` esvazia a seção.
 * Só toca linhas com deleted_at não nulo; respeita FKs (fornecedor ligado a evento é pulado);
 * nunca apaga tipos em PURGE_BLOCKED. Registra no admin_audit_log.
 */
export async function purgeItems(db: PurgeDb, kind: TrashKind, ids: readonly unknown[] | "all", adminId: string): Promise<PurgeResult> {
  const table = TRASH_KINDS[kind].table;
  const blocked = PURGE_BLOCKED[kind];
  const wanted = ids === "all" ? null : cleanIds(ids);
  const base: PurgeResult = { kind, deleted: 0, skipped: 0, attachments: [] };
  if (wanted !== null && wanted.length === 0) return base;

  let sel = db.from(table).select(kind === "chamados" ? "id,attachment_path" : "id").not("deleted_at", "is", null);
  if (wanted !== null) sel = sel.in("id", wanted);
  const found = await sel.limit(500);
  if (found.error) throw new Error(found.error.message);
  const rows = found.data ?? [];
  if (blocked) return { ...base, skipped: rows.length, reason: rows.length ? blocked : undefined };

  let targets = rows.map((r) => String(r.id));
  let skipped = 0;
  let reason: string | undefined;
  if (kind === "fornecedores" && targets.length) {
    const inUse = new Set<string>();
    for (const ref of SUPPLIER_REFERENCING_TABLES) {
      const used = await db.from(ref).select("supplier_id").in("supplier_id", targets).limit(5000);
      if (used.error) throw new Error(used.error.message);
      for (const r of used.data ?? []) inUse.add(String(r.supplier_id));
    }
    skipped = targets.filter((id) => inUse.has(id)).length;
    targets = targets.filter((id) => !inUse.has(id));
    if (skipped) reason = SUPPLIER_IN_USE_REASON;
  }
  if (targets.length === 0) return { ...base, skipped, reason };

  const del = await db.from(table).delete().in("id", targets).not("deleted_at", "is", null);
  if (del.error) throw new Error(del.error.message);
  const attachments = kind === "chamados"
    ? rows.filter((r) => targets.includes(String(r.id)) && typeof r.attachment_path === "string").map((r) => r.attachment_path as string)
    : [];
  const audit = await db.from("admin_audit_log").insert({
    admin_id: adminId,
    action: ids === "all" ? "trash.empty" : "trash.purge",
    target_table: table,
    target_ids: targets,
    details: { kind, deleted: targets.length, skipped },
  });
  if (audit.error) throw new Error(audit.error.message);
  return { kind, deleted: targets.length, skipped, reason, attachments };
}

/** Texto do resultado para o admin (inclui o motivo dos itens pulados). */
export function purgeSummary(results: readonly PurgeResult[]): string {
  const deleted = results.reduce((n, r) => n + r.deleted, 0);
  const parts = [`${deleted} ${deleted === 1 ? "item apagado" : "itens apagados"} definitivamente.`];
  for (const r of results) {
    if (r.skipped && r.reason) parts.push(`${TRASH_KINDS[r.kind].label}: ${r.skipped} ${r.skipped === 1 ? "item mantido" : "itens mantidos"}. ${r.reason}`);
  }
  return parts.join(" ");
}

/** Frase que o admin precisa digitar para confirmar a exclusão definitiva. */
export const PURGE_CONFIRM_WORD = "EXCLUIR";
export function purgeConfirmed(v: unknown): boolean {
  return typeof v === "string" && v.trim().toUpperCase() === PURGE_CONFIRM_WORD;
}
