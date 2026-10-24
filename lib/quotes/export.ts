import { CATEGORY_LABELS, type CategoryCode } from "@/lib/catalog/v1";
import { centsToCsv, toCsv } from "@/lib/export/csv";

import type { ScenarioSnapshotBreakdown } from "./scenarios";

export function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c as CategoryCode] ?? c;
}

export interface PrintLine {
  supplierName: string;
  contact: string | null;
  categories: string[];
  effectiveCents: number;
}

export function scenarioLines(snap: ScenarioSnapshotBreakdown): PrintLine[] {
  const sc = snap.outcome.scenario;
  if (sc === null) return [];
  return sc.selections.map((s) => ({
    supplierName: s.supplierName,
    contact: snap.contacts[s.supplierId]?.contact ?? null,
    categories: s.categories.map(categoryLabel),
    effectiveCents: s.effectiveCents,
  }));
}

export function scenarioCsv(snap: ScenarioSnapshotBreakdown): string {
  const lines = scenarioLines(snap);
  const total = snap.outcome.scenario?.totalCents ?? 0;
  return toCsv(
    ["cenario", "fornecedor", "contato", "categorias", "valor_brl"],
    [
      ...lines.map((l) => [snap.label, l.supplierName, l.contact, l.categories.join(", "), centsToCsv(l.effectiveCents)]),
      [snap.label, "TOTAL", null, null, centsToCsv(total)],
    ],
  );
}
