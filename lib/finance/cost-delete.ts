import { z } from "zod";

/** Exclusão recuperável (deleted_at) das linhas do Detalhamento: cost_entries ("c:") e llm_usage_events ("l:"). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function splitRefs(refs: readonly unknown[]): { cost: string[]; llm: string[] } | null {
  if (refs.length === 0 || refs.length > 500) return null;
  const cost: string[] = [];
  const llm: string[] = [];
  for (const r of refs) {
    if (typeof r !== "string") return null;
    const [kind, id] = r.split(":");
    if (!id || !UUID.test(id)) return null;
    if (kind === "c") cost.push(id);
    else if (kind === "l") llm.push(id);
    else return null;
  }
  return { cost, llm };
}

export const clearSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  provider: z.string().regex(/^[a-z0-9_]{2,40}$/).optional(),
});
export type ClearFilter = z.infer<typeof clearSchema>;

type Res = { data: unknown; error: { code?: string } | null };
interface B extends PromiseLike<Res> {
  update(v: Record<string, unknown>): B;
  in(c: string, v: unknown[]): B;
  is(c: string, v: unknown): B;
  eq(c: string, v: unknown): B;
  gte(c: string, v: unknown): B;
  lte(c: string, v: unknown): B;
}
export interface CostDb { from(t: "cost_entries" | "llm_usage_events"): B }

function mark(adminId: string, now: Date) {
  return { deleted_at: now.toISOString(), deleted_by: adminId };
}

export async function softDeleteCostRows(db: CostDb, refs: readonly unknown[], adminId: string, now = new Date()): Promise<{ ok: boolean; error?: string }> {
  const s = splitRefs(refs);
  if (s === null) return { ok: false, error: "Seleção inválida." };
  const ops: PromiseLike<Res>[] = [];
  if (s.cost.length) ops.push(db.from("cost_entries").update(mark(adminId, now)).in("id", s.cost).is("deleted_at", null));
  if (s.llm.length) ops.push(db.from("llm_usage_events").update(mark(adminId, now)).in("id", s.llm).is("deleted_at", null));
  const res = await Promise.all(ops);
  return res.some((r) => r.error) ? { ok: false, error: "Não foi possível excluir." } : { ok: true };
}

/** "Limpar" por período (+ provedor opcional): mesmo intervalo UTC usado pelo loadFinance. */
export async function clearCostPeriod(db: CostDb, raw: unknown, adminId: string, now = new Date()): Promise<{ ok: boolean; error?: string }> {
  const p = clearSchema.safeParse(raw);
  if (!p.success || p.data.from > p.data.to) return { ok: false, error: "Período inválido." };
  const { from, to, provider } = p.data;
  const start = `${from}T00:00:00Z`;
  const end = `${to}T23:59:59.999Z`;
  let c = db.from("cost_entries").update(mark(adminId, now)).is("deleted_at", null).gte("occurred_at", start).lte("occurred_at", end);
  let l = db.from("llm_usage_events").update(mark(adminId, now)).is("deleted_at", null).gte("created_at", start).lte("created_at", end);
  if (provider) {
    c = c.eq("provider", provider);
    l = l.eq("provider", provider === "xai" ? "grok" : provider);
  }
  const res = await Promise.all([c, l]);
  return res.some((r) => r.error) ? { ok: false, error: "Não foi possível limpar." } : { ok: true };
}
