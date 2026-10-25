import { centsToCsv, toCsv } from "@/lib/export/csv";
import type { EventCost } from "@/lib/finance/event-costs";

/** CSV de um evento: custo por ferramenta + receita + margem. */
export function eventCostCsv(e: EventCost, labels: Readonly<Record<string, string>>): string {
  const basis = { real: "real", estimado: "estimado", misto: "misto" } as const;
  const rows = [
    ...e.tools.map((t) => ["custo", labels[t.provider] ?? t.provider, t.calls, centsToCsv(t.cents), basis[t.basis]]),
    ["total_custo", "", e.calls, centsToCsv(e.costCents), e.estimatedCents > 0 ? `${centsToCsv(e.estimatedCents)} estimado` : "real"],
    ["receita", "Asaas (valor pago)", "", centsToCsv(e.revenueCents), ""],
    ["margem", "", "", centsToCsv(e.marginCents), e.marginBps === null ? "" : `${(e.marginBps / 100).toFixed(1).replace(".", ",")}%`],
  ];
  return toCsv(["tipo", "ferramenta", "chamadas", "valor_brl", "base"], rows);
}

export function emptyEventCost(eventId: string, title: string): EventCost {
  return { eventId, title, costCents: 0, estimatedCents: 0, revenueCents: 0, marginCents: 0, marginBps: null, calls: 0, lastAt: null, tools: [] };
}
