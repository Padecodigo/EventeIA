import "server-only";

import { buildEventCosts, type EventCost } from "@/lib/finance/event-costs";
import { loadFinance } from "@/lib/finance/load";

import { emptyEventCost } from "./event-csv";

/** Custos/receita/margem de UM evento (todo o histórico). Somente admin (loadFinance → requireAdmin). */
export async function loadEventCost(eventId: string, title: string): Promise<EventCost> {
  const to = new Date().toISOString().slice(0, 10);
  const data = await loadFinance({ from: "2020-01-01", to }, { eventId });
  return buildEventCosts(data.costs, data.revenue, { [eventId]: title })[0] ?? emptyEventCost(eventId, title);
}
