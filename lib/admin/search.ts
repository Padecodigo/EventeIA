/** Busca geral do admin (clientes, eventos, chamados, fornecedores). Somente leitura. */
export function cleanQuery(q: unknown): string | null {
  if (typeof q !== "string") return null;
  // Remove curingas/sintaxe do PostgREST para não virar filtro arbitrário.
  const s = q.replace(/[%_*,()\\"'`:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return s.length >= 2 ? s : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return UUID.test(s);
}

export interface SearchHit {
  kind: "cliente" | "evento" | "chamado" | "fornecedor";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

type Row = Record<string, unknown>;
type Q = PromiseLike<{ data: Row[] | null }> & { ilike: (c: string, v: string) => Q; eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q; limit: (n: number) => Q };
export interface SearchDb {
  from: (t: string) => { select: (cols: string) => Q };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function searchAdmin(db: SearchDb, raw: unknown, per = 10): Promise<SearchHit[]> {
  const q = cleanQuery(raw);
  if (q === null) return [];
  const like = `%${q}%`;
  const uuid = isUuid(q);
  const run = (table: string, cols: string, col: string, extra?: (x: Q) => Q) => {
    let x = db.from(table).select(cols);
    x = uuid ? x.eq("id", q) : x.ilike(col, like);
    if (extra) x = extra(x);
    return x.limit(per).then((r) => r.data ?? []);
  };
  const [byName, byEmail, events, tickets, suppliers] = await Promise.all([
    run("profiles", "id,display_name,email,role", "display_name"),
    uuid ? Promise.resolve([] as Row[]) : run("profiles", "id,display_name,email,role", "email"),
    run("events", "id,title,event_date,status,city", "title", (x) => x.is("user_deleted_at", null)),
    run("support_tickets", "id,subject,status,created_at", "subject", (x) => x.is("deleted_at", null)),
    run("suppliers", "id,name,category,city", "name", (x) => x.is("deleted_at", null)),
  ]);
  const seen = new Set<string>();
  const clients = [...byName, ...byEmail].filter((r) => !seen.has(str(r.id)) && seen.add(str(r.id)));
  return [
    ...clients.map((r) => ({ kind: "cliente" as const, id: str(r.id), title: str(r.display_name) || "(sem nome)", subtitle: `${str(r.email)} · ${str(r.role)}`, href: `/admin/clientes/${str(r.id)}` })),
    ...events.map((r) => ({ kind: "evento" as const, id: str(r.id), title: str(r.title), subtitle: `${str(r.event_date)} · ${str(r.city) || "sem cidade"} · ${str(r.status)}`, href: `/admin/eventos/${str(r.id)}` })),
    ...tickets.map((r) => ({ kind: "chamado" as const, id: str(r.id), title: str(r.subject), subtitle: `${str(r.status)} · ${str(r.created_at).slice(0, 10)}`, href: `/admin/chamados/${str(r.id)}` })),
    ...suppliers.map((r) => ({ kind: "fornecedor" as const, id: str(r.id), title: str(r.name), subtitle: `${str(r.category)} · ${str(r.city) || "sem cidade"}`, href: `/admin/fornecedores/${str(r.id)}` })),
  ];
}
