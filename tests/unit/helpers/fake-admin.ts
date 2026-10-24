/**
 * Supabase admin falso e encadeável para testes de integração de rotas:
 * registra cada operação (tabela, método, argumentos) e responde via `respond`.
 */
export interface Op {
  table: string;
  op: string;
  args: unknown[];
  filters: [string, unknown[]][];
}

export function createFakeAdmin(
  respond: (op: Op) => { data: unknown; error: null | { code: string } } = () => ({
    data: null,
    error: null,
  }),
) {
  const ops: Op[] = [];
  const WRITE = new Set(["insert", "upsert", "update", "delete", "select"]);
  function builder(table: string): unknown {
    const op: Op = { table, op: "", args: [], filters: [] };
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            if (!ops.includes(op)) ops.push(op);
            const r = respond(op);
            return (res: (v: unknown) => unknown) => res(r);
          }
          if (prop === "maybeSingle" || prop === "single") {
            return () => {
              if (!ops.includes(op)) ops.push(op);
              return Promise.resolve(respond(op));
            };
          }
          return (...args: unknown[]) => {
            if (WRITE.has(prop) && (op.op === "" || op.op === "select")) {
              if (op.op === "" || prop !== "select") {
                op.op = prop;
                op.args = args;
              }
            } else {
              op.filters.push([prop, args]);
            }
            return proxy;
          };
        },
      },
    );
    return proxy;
  }
  return { ops, admin: { from: (table: string) => builder(table) } };
}
