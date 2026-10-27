import { buildEventScenarios, toSnapshotRows, type QuotationRowForScenario } from "./scenarios";

/** Entrega das cotações (fase 4), idempotente pela marca events.quotes_delivered_at. */
export interface DeliveryDeps {
  /** UPDATE ... SET quotes_delivered_at = now() WHERE quotes_delivered_at IS NULL; true se marcou. */
  claim(eventId: string): Promise<boolean>;
  release(eventId: string): Promise<void>;
  load(
    eventId: string,
  ): Promise<{ requirements: { category: string }[]; quotations: QuotationRowForScenario[]; guestCount: number }>;
  insertSnapshots(rows: ReturnType<typeof toSnapshotRows>): Promise<void>;
  engineVersion: string;
}

export async function deliverEventQuotes(
  deps: DeliveryDeps,
  eventId: string,
): Promise<{ status: "delivered"; scenarios: number } | { status: "already_delivered" }> {
  if (!(await deps.claim(eventId))) return { status: "already_delivered" };
  try {
    const { requirements, quotations, guestCount } = await deps.load(eventId);
    const result = buildEventScenarios(requirements, quotations, guestCount);
    const rows = toSnapshotRows(eventId, deps.engineVersion, result, quotations);
    await deps.insertSnapshots(rows);
    return {
      status: "delivered",
      scenarios: rows.filter((r) => r.breakdown.outcome.scenario !== null).length,
    };
  } catch (error) {
    await deps.release(eventId); // permite o retry do job
    throw error;
  }
}
