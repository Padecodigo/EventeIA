import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Leitura das opções/seleções de fornecedores para o painel do evento (nível de
 * categoria). Usa o client admin porque `suppliers` é um catálogo global (RLS só
 * permite admin) — a filtragem por fornecedor ligado ao evento é feita aqui.
 */

export type SupplierOptionUnit = "por_pessoa" | "por_hora" | "unidade" | "pacote";

export interface SupplierOptionView {
  optionId: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  unit: SupplierOptionUnit;
}

export interface SupplierSelectionView {
  supplierId: string;
  supplierName: string;
  category: string;
  options: SupplierOptionView[];
  selectedOptionId: string | null;
  status: string | null;
}

interface SelectionReadDb {
  from(table: "supplier_conversations" | "quotations" | "vendor_prospects"): {
    select(columns: string): {
      eq(column: string, value: string): {
        not(column: string, operator: string, value: null): Promise<{
          data: { supplier_id: string | null }[] | null;
        }>;
      };
    };
  };
  from(table: "suppliers"): {
    select(columns: string): {
      in(column: string, values: string[]): Promise<{
        data: { id: string; name: string; category: string }[] | null;
      }>;
    };
  };
  from(table: "supplier_options"): {
    select(columns: string): {
      eq(column: string, value: boolean): {
        in(column: string, values: string[]): Promise<{
          data: {
            id: string;
            supplier_id: string;
            name: string;
            description: string | null;
            price_cents: number | null;
            unit: SupplierOptionUnit;
          }[] | null;
        }>;
      };
    };
  };
  from(table: "supplier_selections"): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{
        data: { supplier_id: string; option_id: string | null; status: string }[] | null;
      }>;
    };
  };
}

async function linkedSupplierIds(db: SelectionReadDb, eventId: string): Promise<string[]> {
  const tables = ["supplier_conversations", "quotations", "vendor_prospects"] as const;
  const ids = new Set<string>();
  for (const table of tables) {
    const { data } = await db
      .from(table)
      .select("supplier_id")
      .eq("event_id", eventId)
      .not("supplier_id", "is", null);
    for (const row of data ?? []) {
      if (row.supplier_id !== null) ids.add(row.supplier_id);
    }
  }
  return [...ids];
}

export async function listSupplierSelections(
  db: SelectionReadDb = getSupabaseAdmin() as unknown as SelectionReadDb,
  eventId: string,
): Promise<SupplierSelectionView[]> {
  const supplierIds = await linkedSupplierIds(db, eventId);
  if (supplierIds.length === 0) return [];

  const [suppliers, options, selections] = await Promise.all([
    db.from("suppliers").select("id,name,category").in("id", supplierIds),
    db
      .from("supplier_options")
      .select("id,supplier_id,name,description,price_cents,unit")
      .eq("active", true)
      .in("supplier_id", supplierIds),
    db
      .from("supplier_selections")
      .select("supplier_id,option_id,status")
      .eq("event_id", eventId),
  ]);

  const selectionBySupplier = new Map(
    (selections.data ?? []).map((row) => [row.supplier_id, row]),
  );

  return (suppliers.data ?? []).map((supplier) => ({
    supplierId: supplier.id,
    supplierName: supplier.name,
    category: supplier.category,
    options: (options.data ?? [])
      .filter((option) => option.supplier_id === supplier.id)
      .map((option) => ({
        optionId: option.id,
        name: option.name,
        description: option.description,
        priceCents: option.price_cents,
        unit: option.unit,
      })),
    selectedOptionId: selectionBySupplier.get(supplier.id)?.option_id ?? null,
    status: selectionBySupplier.get(supplier.id)?.status ?? null,
  }));
}
