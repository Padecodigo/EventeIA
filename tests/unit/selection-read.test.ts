import { describe, expect, it } from "vitest";

import { listSupplierSelections } from "@/lib/selection/read";

/**
 * Regra do proprietário: o sistema NUNCA pré-seleciona opções/produtos.
 * Sem escolha registrada pelo usuário, `selectedOptionId` e `status` são null —
 * mesmo que o fornecedor tenha várias opções ativas.
 */
function makeDb(options: { id: string; supplier_id: string; name: string; description: string | null; price_cents: number | null; unit: "por_pessoa" | "por_hora" | "unidade" | "pacote" }[]) {
  function chain(result: () => unknown[]) {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      not: () => q,
      then: (resolve: (value: { data: unknown[] }) => unknown) => Promise.resolve({ data: result() }).then(resolve),
    };
    return q;
  }

  return {
    from(table: string) {
      if (table === "suppliers") {
        return {
          select: () => ({
            in: async () => ({ data: [{ id: "sup-1", name: "Buffet do Vale", category: "buffet" }] }),
          }),
        };
      }
      if (table === "supplier_options") {
        return {
          select: () => ({ eq: () => ({ in: async () => ({ data: options }) }) }),
        };
      }
      if (table === "supplier_selections") {
        return {
          select: () => ({ eq: async () => ({ data: [] }) }),
        };
      }
      return chain(() => (table === "supplier_conversations" ? [{ supplier_id: "sup-1" }] : []));
    },
  } as unknown as Parameters<typeof listSupplierSelections>[0];
}

describe("listSupplierSelections — nenhuma pré-seleção automática", () => {
  it("devolve opções ativas sem escolher nenhuma quando o usuário ainda não escolheu", async () => {
    const rows = await listSupplierSelections(
      makeDb([
        { id: "opt-1", supplier_id: "sup-1", name: "Churrasco", description: null, price_cents: 8900, unit: "por_pessoa" },
        { id: "opt-2", supplier_id: "sup-1", name: "Jantar", description: null, price_cents: 12000, unit: "por_pessoa" },
      ]),
      "evt-1",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.options).toHaveLength(2);
    expect(rows[0]?.selectedOptionId).toBeNull();
    expect(rows[0]?.status).toBeNull();
  });
});
