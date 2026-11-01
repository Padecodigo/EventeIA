import { isFreeItemCode } from "@/lib/catalog/free-items";

interface LookingForDb {
  from(table: "event_requirements"): {
    select(columns: string): {
      eq(
        column: string,
        value: string | boolean,
      ): {
        eq(
          column: string,
          value: string | boolean,
        ): { like(column: string, pattern: string): PromiseLike<{ data: unknown }> };
      };
    };
  };
}

export interface LookingForItem {
  canonical: string;
  terms: string[];
}

/** Itens livres selecionados do evento → nome canônico + termos (para o post). */
export function lookingForFromRows(rows: unknown): LookingForItem[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .flatMap((r: unknown) => {
      const row = r as { item_code?: unknown; label?: unknown; notes?: unknown };
      if (typeof row.item_code !== "string" || !isFreeItemCode(row.item_code)) return [];
      if (typeof row.label !== "string" || row.label.trim().length === 0) return [];
      const notes = typeof row.notes === "string" ? row.notes : "";
      const terms = notes
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
        .slice(0, 10);
      return [{ canonical: row.label.trim().slice(0, 80), terms }];
    })
    .slice(0, 10);
}

export async function loadLookingFor(db: unknown, eventId: string): Promise<LookingForItem[]> {
  try {
    const { data } = await (db as LookingForDb)
      .from("event_requirements")
      .select("item_code,label,notes")
      .eq("event_id", eventId)
      .eq("selected", true)
      .like("item_code", "livre\\_%");
    return lookingForFromRows(data);
  } catch {
    return [];
  }
}
