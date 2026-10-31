import type { SignupDb } from "@/lib/admin/signups";

type Row = Record<string, unknown>;

export interface SignupQueryLog {
  table: string;
  op: "select" | "order" | "limit" | "in";
  args: unknown[];
}

/** Supabase falso mínimo para os cadastros: aplica select/order/limit/in e registra o que foi pedido. */
export function fakeSignupsDb(tables: { profiles?: Row[]; events?: Row[] }) {
  const queries: SignupQueryLog[] = [];

  function from(table: "profiles" | "events") {
    let data = [...(tables[table] ?? [])];
    const builder = {
      select(columns: string) {
        queries.push({ table, op: "select", args: [columns] });
        return builder;
      },
      order(column: string, options: { ascending: boolean }) {
        queries.push({ table, op: "order", args: [column, options] });
        const value = (row: Row) => (typeof row[column] === "string" ? row[column] : "");
        data = [...data].sort((a, b) => value(a).localeCompare(value(b)) * (options.ascending ? 1 : -1));
        return builder;
      },
      limit(count: number) {
        queries.push({ table, op: "limit", args: [count] });
        data = data.slice(0, count);
        return builder;
      },
      in(column: string, values: string[]) {
        queries.push({ table, op: "in", args: [column, values] });
        data = data.filter((row) => values.includes(String(row[column])));
        return builder;
      },
      then<T>(resolve: (value: { data: Row[]; error: null }) => T) {
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return builder;
  }

  return { db: { from } as unknown as SignupDb, queries };
}
