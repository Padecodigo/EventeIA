import { centsToCsv, toCsv } from "@/lib/export/csv";

import { categoryLabel } from "./labels";
import type { ScenarioSnapshotBreakdown } from "./scenarios";

export { categoryLabel };

export interface PrintLine {
  supplierName: string;
  contact: string | null;
  categories: string[];
  effectiveCents: number;
  includes: string[];
  excludes: string[];
  notes: string[];
}

export function scenarioLines(snap: ScenarioSnapshotBreakdown): PrintLine[] {
  const sc = snap.outcome.scenario;
  if (sc === null) return [];
  return sc.selections.map((s) => ({
    supplierName: s.supplierName,
    contact: snap.contacts[s.supplierId]?.contact ?? null,
    categories: s.categories.map(categoryLabel),
    effectiveCents: s.effectiveCents,
    includes: snap.details?.[s.supplierId]?.includes ?? [],
    excludes: snap.details?.[s.supplierId]?.excludes ?? [],
    notes: snap.details?.[s.supplierId]?.notes ?? [],
  }));
}

export function scenarioCsv(snap: ScenarioSnapshotBreakdown): string {
  const lines = scenarioLines(snap);
  const total = snap.outcome.scenario?.totalCents ?? 0;
  const incomplete = snap.uncovered.length > 0 || lines.length === 0;
  const label = incomplete ? "Orçamento incompleto" : snap.label;
  return toCsv(
    [
      "orcamento",
      "fornecedor",
      "contato",
      "categorias",
      "valor_brl",
      "inclui",
      "nao_inclui",
      "observacoes",
    ],
    [
      ...lines.map((l) => [
        label,
        l.supplierName,
        l.contact,
        l.categories.join(", "),
        centsToCsv(l.effectiveCents),
        l.includes.join("; "),
        l.excludes.join("; "),
        l.notes.join(" "),
      ]),
      [label, incomplete ? "TOTAL PARCIAL" : "TOTAL", null, null, centsToCsv(total), null, null, null],
      ...snap.uncovered.map((c) => [
        label,
        "NÃO COBERTO",
        null,
        categoryLabel(c),
        null,
        null,
        null,
        "Sem cotação para esta necessidade; não é possível confirmar o menor preço.",
      ]),
    ],
  );
}
