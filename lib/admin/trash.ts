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

/** Tipos que NÃO podem ser apagados definitivamente (nenhum desde 0076: custos vão para o arquivo morto). */
export const PURGE_BLOCKED: Partial<Record<TrashKind, string>> = {};

/** Coluna que tira o item da lixeira sem apagar a linha (0076). */
const TRASH_HIDDEN_COLUMN: Partial<Record<TrashKind, "archived_at" | "anonymized_at">> = {
  custos: "archived_at",
  fornecedores: "anonymized_at",
};

export const COST_ARCHIVE_REASON =
  "Custos são registros fiscais: saem da lixeira e vão para o Arquivo morto (somente leitura), onde ficam 5 anos e depois são apagados automaticamente.";

export const SUPPLIER_IN_USE_REASON =
  "Fornecedores ligados a eventos de clientes têm nome e contatos apagados de forma irreversível (viram “Fornecedor removido”); o histórico do cliente continua intacto.";

/** Retenção fiscal do arquivo morto. */
export const ARCHIVE_RETENTION_YEARS = 5;
export function archiveRetentionEnd(occurredAt: string, archivedAt: string): Date {
  const base = new Date(Math.max(Date.parse(occurredAt), Date.parse(archivedAt)));
  base.setUTCFullYear(base.getUTCFullYear() + ARCHIVE_RETENTION_YEARS);
  return base;
}

/** Patch irreversível de anonimização de fornecedor (PII fora; linha/FKs mantidas). */
const SUPPLIER_ANONYMIZED_NAME = "Fornecedor removido";
export function supplierAnonymizePatch(now: Date): Record<string, string | null> {
  return {
    name: SUPPLIER_ANONYMIZED_NAME,
    phone_e164: null,
    contact_email: null,
    website_url: null,
    source_url: "removido",
    external_id: null,
    whatsapp_verified: null,
    anonymized_at: now.toISOString(),
  };
}

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

type UpdateQ = PromiseLike<{ error: { message: string } | null }> & {
  in: (c: string, v: string[]) => UpdateQ;
  not: (c: string, op: string, v: null) => UpdateQ;
  is: (c: string, v: null) => UpdateQ;
};
export interface TrashDb {
  from: (t: string) => { update: (p: Record<string, null>) => UpdateQ };
}

/** Restaura (deleted_at/deleted_by = null) somente linhas que estão na lixeira. */
export async function restoreItems(db: TrashDb, kind: TrashKind, ids: readonly unknown[]): Promise<number> {
  const clean = cleanIds(ids);
  if (clean.length === 0) return 0;
  let q = db
    .from(TRASH_KINDS[kind].table)
    .update({ deleted_at: null, deleted_by: null })
    .in("id", clean)
    .not("deleted_at", "is", null);
  const hidden = TRASH_HIDDEN_COLUMN[kind];
  if (hidden) q = q.is(hidden, null); // arquivados/anonimizados não voltam
  const { error } = await q;
  if (error) throw new Error(error.message);
  return clean.length;
}

// Builder mínimo (select/delete/insert) usado na exclusão definitiva.
type Res<T> = { data: T | null; error: { message: string } | null };
export interface PurgeQ<T = Row[]> extends PromiseLike<Res<T>> {
  in(c: string, v: string[]): PurgeQ<T>;
  not(c: string, op: string, v: null): PurgeQ<T>;
  is(c: string, v: null): PurgeQ<T>;
  limit(n: number): PurgeQ<T>;
}
type Row = Record<string, unknown>;
export interface PurgeDb {
  from(t: string): {
    select(cols: string): PurgeQ;
    delete(): PurgeQ;
    update(v: Row): PurgeQ;
    insert(v: Row): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface PurgeResult {
  kind: TrashKind;
  deleted: number;
  skipped: number;
  /** Custos movidos para o arquivo morto. */
  archived?: number;
  /** Fornecedores anonimizados (referenciados por histórico de cliente). */
  anonymized?: number;
  reason?: string;
  /** Anexos (storage) dos chamados apagados, para o chamador remover. */
  attachments: string[];
}

/**
 * Exclusão DEFINITIVA de itens da lixeira. `ids = "all"` esvazia a seção.
 * Só toca linhas com deleted_at não nulo; respeita FKs (fornecedor ligado a evento é pulado);
 * nunca apaga tipos em PURGE_BLOCKED. Registra no admin_audit_log.
 */
export async function purgeItems(db: PurgeDb, kind: TrashKind, ids: readonly unknown[] | "all", adminId: string, now: Date = new Date()): Promise<PurgeResult> {
  const table = TRASH_KINDS[kind].table;
  const hidden = TRASH_HIDDEN_COLUMN[kind];
  const wanted = ids === "all" ? null : cleanIds(ids);
  const base: PurgeResult = { kind, deleted: 0, skipped: 0, attachments: [] };
  if (wanted !== null && wanted.length === 0) return base;

  let sel = db.from(table).select(kind === "chamados" ? "id,attachment_path" : "id").not("deleted_at", "is", null);
  if (hidden) sel = sel.is(hidden, null);
  if (wanted !== null) sel = sel.in("id", wanted);
  const found = await sel.limit(500);
  if (found.error) throw new Error(found.error.message);
  const rows = found.data ?? [];
  if (rows.length === 0) return base;
  const action = ids === "all" ? "trash.empty" : "trash.purge";
  const audit = async (verb: string, target: string[], details: Row) => {
    const r = await db.from("admin_audit_log").insert({ admin_id: adminId, action: `${action}${verb}`, target_table: table, target_ids: target, details: { kind, ...details } });
    if (r.error) throw new Error(r.error.message);
  };

  let targets = rows.map((r) => String(r.id));

  if (kind === "custos") {
    const upd = await db.from(table).update({ archived_at: now.toISOString(), archived_by: adminId })
      .in("id", targets).not("deleted_at", "is", null).is("archived_at", null);
    if (upd.error) throw new Error(upd.error.message);
    await audit(".archive", targets, { archived: targets.length });
    return { ...base, archived: targets.length, reason: COST_ARCHIVE_REASON };
  }

  let anonymized = 0;
  if (kind === "fornecedores") {
    const inUse = new Set<string>();
    for (const ref of SUPPLIER_REFERENCING_TABLES) {
      const used = await db.from(ref).select("supplier_id").in("supplier_id", targets).limit(5000);
      if (used.error) throw new Error(used.error.message);
      for (const r of used.data ?? []) inUse.add(String(r.supplier_id));
    }
    const keep = targets.filter((id) => inUse.has(id));
    targets = targets.filter((id) => !inUse.has(id));
    if (keep.length) {
      const upd = await db.from(table).update(supplierAnonymizePatch(now))
        .in("id", keep).not("deleted_at", "is", null).is("anonymized_at", null);
      if (upd.error) throw new Error(upd.error.message);
      anonymized = keep.length;
      await audit(".anonymize", keep, { anonymized });
    }
  }
  if (targets.length === 0) return { ...base, anonymized, reason: anonymized ? SUPPLIER_IN_USE_REASON : undefined };

  const del = await db.from(table).delete().in("id", targets).not("deleted_at", "is", null);
  if (del.error) throw new Error(del.error.message);
  const attachments = kind === "chamados"
    ? rows.filter((r) => targets.includes(String(r.id)) && typeof r.attachment_path === "string").map((r) => r.attachment_path as string)
    : [];
  await audit("", targets, { deleted: targets.length });
  return { kind, deleted: targets.length, skipped: 0, anonymized, reason: anonymized ? SUPPLIER_IN_USE_REASON : undefined, attachments };
}

/** Texto do resultado para o admin (inclui o motivo dos itens pulados). */
export function purgeSummary(results: readonly PurgeResult[]): string {
  const sum = (f: (r: PurgeResult) => number) => results.reduce((n, r) => n + f(r), 0);
  const deleted = sum((r) => r.deleted);
  const archived = sum((r) => r.archived ?? 0);
  const anonymized = sum((r) => r.anonymized ?? 0);
  const parts = [`${deleted} ${deleted === 1 ? "item apagado" : "itens apagados"} definitivamente.`];
  if (archived) parts.push(`${archived} ${archived === 1 ? "custo movido" : "custos movidos"} para o Arquivo morto (guardados 5 anos).`);
  if (anonymized) parts.push(`${anonymized} ${anonymized === 1 ? "fornecedor anonimizado" : "fornecedores anonimizados"} (histórico dos clientes mantido).`);
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
