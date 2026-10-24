import { z } from "zod";

import type { QuoteFee, ScenarioKind, ScenarioOutcome, SupplierQuote } from "@/lib/engine/types";
import { mandatoryFeeSchema } from "@/lib/schemas/quotation-extraction";

import { isUsableQuote, quotableCategories } from "./collector";
import { composeWithCoverage, type SelectionNote } from "./coverage";
import { categoryLabel } from "./labels";

/**
 * Fase 4 — adaptador quotations + event_requirements → buildAllScenarios → budget_snapshots.
 * Puro e determinístico. Só cotações aproveitáveis (confiança ≥ 0,7, valor > 0, sem pendência).
 */

export const SCENARIO_KINDS: readonly ScenarioKind[] = ["preco", "custo_beneficio", "comodidade"];

export const SCENARIO_LABELS: Record<ScenarioKind, string> = {
  preco: "Mais barato",
  custo_beneficio: "Melhor custo-benefício",
  comodidade: "Mais prático",
};

/** Slugs de URL (/eventos/[id]/orcamento/[cenario]/imprimir). */
export const SCENARIO_SLUGS: Record<ScenarioKind, string> = {
  preco: "mais-barato",
  custo_beneficio: "custo-beneficio",
  comodidade: "mais-pratico",
};

export function kindFromSlug(slug: string): ScenarioKind | null {
  return SCENARIO_KINDS.find((k) => SCENARIO_SLUGS[k] === slug) ?? null;
}

export interface QuotationRowForScenario {
  id: string;
  category: string;
  vendor_name: string;
  vendor_contact: string | null;
  amount_cents: number;
  fees_cents: number;
  confidence: number | null;
  needs_followup: boolean;
  extraction: unknown;
}

const extractionFeesSchema = z.object({ fees: z.array(mandatoryFeeSchema).max(30) });

/** amount_cents já inclui as taxas extras: base = total − taxas; taxas viram fees do motor. */
export function toSupplierQuote(row: QuotationRowForScenario): SupplierQuote {
  const parsed = extractionFeesSchema.safeParse(row.extraction);
  const fees: QuoteFee[] = (parsed.success ? parsed.data.fees : [])
    .filter((f) => !f.included_in_base)
    .map((f) => ({
      category: f.category,
      description: f.description,
      amountCents: f.amount_cents,
      includedInBase: false,
    }));
  const feesSum = fees.reduce((s, f) => s + (f.amountCents ?? 0), 0);
  // Coerência: se as taxas do JSON não batem com fees_cents, confia no total gravado.
  const consistent = feesSum === row.fees_cents && feesSum <= row.amount_cents;
  return {
    supplierId: row.id,
    supplierName: row.vendor_name,
    covers: [row.category],
    basePriceCents: consistent ? row.amount_cents - feesSum : row.amount_cents,
    totalPriceCents: row.amount_cents,
    fees: consistent ? fees : [],
    qualityBps: Math.round(Math.min(1, Math.max(0, row.confidence ?? 0)) * 10_000),
  };
}

export interface EventScenarios {
  /** Categorias consideradas (com ao menos 1 cotação aproveitável). */
  required: string[];
  /** Categorias pedidas sem nenhuma cotação aproveitável — "não coberto". */
  uncovered: string[];
  outcomes: Record<ScenarioKind, ScenarioOutcome>;
  /** O que cada seleção inclui/não inclui e por que adicionais foram dispensados. */
  details?: Record<ScenarioKind, Record<string, SelectionNote>>;
}

export function buildEventScenarios(
  requirements: readonly { category: string }[],
  quotations: readonly QuotationRowForScenario[],
): EventScenarios {
  const usable = quotations.filter(
    (q) => !q.needs_followup && isUsableQuote(q.amount_cents, q.confidence ?? 0),
  );
  const wanted = quotableCategories(requirements);
  const r = composeWithCoverage(wanted, usable, categoryLabel);
  return { required: r.required, uncovered: r.uncovered, outcomes: r.outcomes, details: r.details };
}

export const SNAPSHOT_SOURCE = "quotations_v1";

export interface ScenarioSnapshotBreakdown {
  source: typeof SNAPSHOT_SOURCE;
  kind: ScenarioKind;
  label: string;
  required: string[];
  uncovered: string[];
  outcome: ScenarioOutcome;
  /** Contatos dos fornecedores escolhidos (para impressão/CSV do próprio cliente). */
  contacts: Record<string, { name: string; contact: string | null; category: string }>;
  /** Inclui / não inclui / observações por seleção (snapshots antigos não têm). */
  details?: Record<string, { includes: string[]; excludes: string[]; notes: string[] }>;
}

export function toSnapshotRows(
  eventId: string,
  engineVersion: string,
  result: EventScenarios,
  quotations: readonly QuotationRowForScenario[],
): {
  event_id: string;
  engine_version: string;
  total_cents: number;
  breakdown: ScenarioSnapshotBreakdown;
}[] {
  const byId = new Map(quotations.map((q) => [q.id, q]));
  return SCENARIO_KINDS.map((kind) => {
    const outcome = result.outcomes[kind];
    const contacts: ScenarioSnapshotBreakdown["contacts"] = {};
    const details: NonNullable<ScenarioSnapshotBreakdown["details"]> = {};
    for (const s of outcome.scenario?.selections ?? []) {
      const note = result.details?.[kind]?.[s.supplierId];
      if (note !== undefined)
        details[s.supplierId] = {
          includes: note.includes,
          excludes: note.excludes,
          notes: note.notes,
        };
      const q = byId.get(note?.offerId ?? s.supplierId);
      if (q !== undefined)
        contacts[s.supplierId] = {
          name: q.vendor_name,
          contact: q.vendor_contact,
          category: q.category,
        };
    }
    return {
      event_id: eventId,
      engine_version: engineVersion,
      total_cents: outcome.scenario?.totalCents ?? 0,
      breakdown: {
        source: SNAPSHOT_SOURCE,
        kind,
        label: SCENARIO_LABELS[kind],
        required: result.required,
        uncovered: result.uncovered,
        outcome,
        contacts,
        details,
      },
    };
  });
}

const breakdownSchema = z.object({
  source: z.literal(SNAPSHOT_SOURCE),
  kind: z.enum(["preco", "custo_beneficio", "comodidade"]),
  label: z.string(),
  required: z.array(z.string()),
  uncovered: z.array(z.string()),
  outcome: z.object({
    kind: z.enum(["preco", "custo_beneficio", "comodidade"]),
    scenario: z
      .object({
        kind: z.enum(["preco", "custo_beneficio", "comodidade"]),
        totalCents: z.number().int(),
        supplierCount: z.number().int(),
        scoreCents: z.number().int().nullable(),
        selections: z.array(
          z.object({
            supplierId: z.string(),
            supplierName: z.string(),
            categories: z.array(z.string()),
            effectiveCents: z.number().int(),
          }),
        ),
        ownedCategories: z.array(z.string()),
      })
      .nullable(),
    missing: z.array(
      z.object({
        category: z.string(),
        supplierId: z.string().nullable(),
        field: z.enum(["base_price_cents", "fee_amount", "quality_bps", "quote"]),
      }),
    ),
  }),
  contacts: z.record(
    z.string(),
    z.object({ name: z.string(), contact: z.string().nullable(), category: z.string() }),
  ),
  details: z
    .record(
      z.string(),
      z.object({
        includes: z.array(z.string()),
        excludes: z.array(z.string()),
        notes: z.array(z.string()),
      }),
    )
    .optional(),
});

/** Lê com zod (fronteira com o banco); null se não for um snapshot de cenário. */
export function parseScenarioSnapshot(breakdown: unknown): ScenarioSnapshotBreakdown | null {
  const parsed = breakdownSchema.safeParse(breakdown);
  return parsed.success ? parsed.data : null;
}

/** Mais recente de cada cenário (linhas em ordem decrescente de created_at). */
export function latestScenarios(
  rows: readonly { breakdown: unknown; created_at: string }[],
): Partial<Record<ScenarioKind, ScenarioSnapshotBreakdown & { createdAt: string }>> {
  const out: Partial<Record<ScenarioKind, ScenarioSnapshotBreakdown & { createdAt: string }>> = {};
  for (const row of rows) {
    const snap = parseScenarioSnapshot(row.breakdown);
    if (snap !== null && out[snap.kind] === undefined)
      out[snap.kind] = { ...snap, createdAt: row.created_at };
  }
  return out;
}
