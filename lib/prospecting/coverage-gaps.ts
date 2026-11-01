import { expectedCoverageItems } from "@/lib/catalog/coverage-map";
import { normalizeCategoryCode } from "@/lib/catalog/v1";
import { SCOPE_COVERS, type ScopeItem } from "@/lib/quotes/scope-items";

/** Linha da função `event_coverage_summary` (0079) — anônima, sem evidência. */
export interface EventCoverageRow {
  quoteLabel: string;
  category: string | null;
  itemCode: string;
  coverage: "included" | "excluded" | "optional_extra" | "unknown";
  extraPriceCents: number | null;
  roundsAsked: number;
  aConfirmar: boolean;
}

export interface CoverageGap {
  item: ScopeItem;
  /** Categoria da cotação que deixou o item de fora. */
  fromCategory: string;
  /** Categoria a prospectar para cobrir o item. */
  needCategory: string;
}

const MAX_ROUNDS = 2;

function covers(r: EventCoverageRow): boolean {
  return r.coverage === "included" || (r.coverage === "optional_extra" && r.extraPriceCents !== null);
}

/** Resolvido sem cobrir: excluído, ou sem resposta firme após as rodadas. */
function resolvedUncovered(r: EventCoverageRow): boolean {
  if (r.coverage === "excluded") return true;
  return !covers(r) && r.roundsAsked >= MAX_ROUNDS;
}

/**
 * Lacunas do evento: item esperado da categoria que NENHUMA cotação cobre e que
 * TODAS as cotações já responderam (ou esgotaram as rodadas). Item ainda em
 * negociação não vira lacuna — evita prospectar antes da hora.
 * Categorias já selecionadas no evento não são duplicadas.
 */
export function eventCoverageGaps(selected: readonly string[], rows: readonly EventCoverageRow[]): CoverageGap[] {
  const selectedSet = new Set(selected.map((c) => normalizeCategoryCode(c) ?? c));
  const byCategory = new Map<string, EventCoverageRow[]>();
  for (const r of rows) {
    if (r.category === null) continue;
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }
  const gaps: CoverageGap[] = [];
  const seen = new Set<string>();
  for (const [category, list] of byCategory) {
    const quotes = new Set(list.map((r) => r.quoteLabel));
    for (const item of expectedCoverageItems(category)) {
      const need = SCOPE_COVERS[item];
      if (need === undefined || need === category || selectedSet.has(need) || seen.has(need)) continue;
      const itemRows = list.filter((r) => r.itemCode === item);
      if (itemRows.some(covers)) continue;
      const answered = new Set(itemRows.filter(resolvedUncovered).map((r) => r.quoteLabel));
      if (answered.size < quotes.size) continue;
      seen.add(need);
      gaps.push({ item, fromCategory: category, needCategory: need });
    }
  }
  return gaps;
}

export function parseCoverageSummary(data: unknown): EventCoverageRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    const r = raw as Record<string, unknown>;
    if (typeof r.item_code !== "string" || typeof r.quote_label !== "string") return [];
    const coverage = ["included", "excluded", "optional_extra", "unknown"].includes(String(r.coverage))
      ? (r.coverage as EventCoverageRow["coverage"])
      : "unknown";
    return [
      {
        quoteLabel: r.quote_label,
        category: typeof r.category === "string" ? r.category : null,
        itemCode: r.item_code,
        coverage,
        extraPriceCents: r.extra_price_cents === null || r.extra_price_cents === undefined ? null : Number(r.extra_price_cents),
        roundsAsked: Number(r.rounds_asked ?? 0),
        aConfirmar: r.a_confirmar === true,
      },
    ];
  });
}
