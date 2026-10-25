/** Banco em memória mínimo (estilo supabase-js) para testes de lixeira/fornecedores. */
export type Row = Record<string, unknown>;
export function memDb(tables: Record<string, Row[]>) {
  const audit: Row[] = [];
  tables.admin_audit_log ??= audit;
  function from(table: string) {
    const ops: [string, string, unknown][] = [];
    let mode: "select" | "update" | "delete" = "select";
    let patch: Row | null = null;
    let single = false;
    const match = (r: Row) => ops.every(([op, c, v]) => {
      const x = r[c] ?? null;
      if (op === "eq" || op === "is") return x === v;
      if (op === "not") return x !== v;
      if (op === "in") return (v as unknown[]).includes(x);
      if (op === "ilike") return String(x ?? "").toLowerCase().includes(String(v).replaceAll("%", "").toLowerCase());
      return true;
    });
    const b = {
      select: () => b, order: () => b, limit: () => b,
      maybeSingle: () => ((single = true), b),
      update: (v: Row) => ((mode = "update"), (patch = v), b),
      delete: () => ((mode = "delete"), b),
      insert: (v: Row) => { (tables[table] ??= []).push(v); return Promise.resolve({ error: null }); },
      eq: (c: string, v: unknown) => (ops.push(["eq", c, v]), b),
      is: (c: string, v: unknown) => (ops.push(["is", c, v]), b),
      not: (c: string, _o: string, v: unknown) => (ops.push(["not", c, v]), b),
      in: (c: string, v: unknown) => (ops.push(["in", c, v]), b),
      ilike: (c: string, v: unknown) => (ops.push(["ilike", c, v]), b),
      then: (res: (v: { data: unknown; error: null }) => unknown, rej?: (e: unknown) => unknown) => {
        const all = tables[table] ?? [];
        const hit = all.filter(match);
        if (mode === "update" && patch) hit.forEach((r) => Object.assign(r, patch));
        if (mode === "delete") tables[table] = all.filter((r) => !hit.includes(r));
        return Promise.resolve({ data: single ? hit[0] ?? null : hit, error: null }).then(res, rej);
      },
    };
    return b;
  }
  return { from, tables };
}
