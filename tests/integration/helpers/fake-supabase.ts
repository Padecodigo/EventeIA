/**
 * Supabase falso em memória (cadeia mínima usada pelas server actions de checkout).
 * Suporta select/eq/maybeSingle/single/insert/update/upsert e rpc configurável.
 */
type Row = Record<string, unknown>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}

export function createFakeDb(tables: Record<string, Row[]>): FakeDb {
  return {
    tables,
    rpc: async () => ({ data: null, error: null }),
  };
}

let seq = 0;

export function fakeClient(db: FakeDb) {
  return {
    rpc: (fn: string, args: Record<string, unknown>) => db.rpc(fn, args),
    from(table: string) {
      db.tables[table] ??= [];
      const rows = db.tables[table];
      const filters: [string, unknown][] = [];
      let op: "select" | "insert" | "update" | "upsert" = "select";
      let payload: Row | null = null;
      let conflict: string | undefined;
      const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
      const run = (): Row[] => {
        if (op === "insert") {
          const row = { id: `${table}-${String(++seq)}`, ...payload };
          rows.push(row);
          return [row];
        }
        if (op === "upsert") {
          const key = conflict ?? "id";
          const existing = rows.find((r) => r[key] === payload?.[key]);
          if (existing !== undefined) {
            Object.assign(existing, payload);
            return [existing];
          }
          const row = { id: `${table}-${String(++seq)}`, ...payload };
          rows.push(row);
          return [row];
        }
        const hit = rows.filter(match);
        if (op === "update") hit.forEach((r) => Object.assign(r, payload));
        return hit;
      };
      const builder = {
        select: () => builder,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return builder;
        },
        insert: (p: Row) => {
          op = "insert";
          payload = p;
          return builder;
        },
        update: (p: Row) => {
          op = "update";
          payload = p;
          return builder;
        },
        upsert: (p: Row, o?: { onConflict?: string }) => {
          op = "upsert";
          payload = p;
          conflict = o?.onConflict;
          return builder;
        },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        single: async () => {
          const r = run()[0];
          return r === undefined
            ? { data: null, error: { code: "PGRST116" } }
            : { data: r, error: null };
        },
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
          resolve({ data: run(), error: null }),
      };
      return builder;
    },
  };
}
