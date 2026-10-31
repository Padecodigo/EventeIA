/**
 * Composição com cobertura normalizada (puro e determinístico).
 *
 * 1. Necessidades do evento = categorias da entrevista.
 * 2. Cada oferta cobre a própria categoria + o que declara INCLUIR (ex.: buffet com garçons ⇒ "garcons").
 * 3. Itens NÃO inclusos com preço separado (ou taxas extras ligadas a uma necessidade) viram
 *    adicionais opcionais daquela oferta: geramos variantes (com/sem cada adicional).
 * 4. O motor escolhe uma combinação com cobertura EXATA (cada necessidade paga uma vez só),
 *    então nunca contrata à parte algo que outra oferta escolhida já inclui.
 * 5. Adicionais descartados por sobreposição viram observações ("já incluso em …").
 * 6. Necessidades sem oferta ficam como "não coberto".
 */

import { z } from "zod";

import {
  CATEGORY_LABELS,
  SUPPLIER_INCLUI_COVERS,
  normalizeCategoryCode,
  normalizeSupplierIncluiTag,
  type CategoryCode,
  type SupplierIncluiTag,
} from "@/lib/catalog/v1";
import { buildAllScenarios, MAX_REQUIRED_CATEGORIES } from "@/lib/engine/scenarios";
import type { QuoteFee, ScenarioKind, ScenarioOutcome, SupplierQuote } from "@/lib/engine/types";
import { formatBRL } from "@/lib/money";
import {
  mandatoryFeeSchema,
  scopeEntrySchema,
  type ScopeEntry,
} from "@/lib/schemas/quotation-extraction";

import { SCOPE_COVERS, SCOPE_LABELS, type ScopeItem } from "./scope-items";

/** Taxa extra → necessidade que ela representa (quando a família pediu essa categoria). */
const FEE_COVERS: Partial<Record<string, string>> = {
  service_staff: "garcons",
  dishes_and_cutlery: "louca",
  cleaning: "limpeza",
};

const MAX_ADDONS_PER_OFFER = 4;

export interface OfferRow {
  id: string;
  category: string;
  vendor_name: string;
  amount_cents: number;
  fees_cents: number;
  confidence: number | null;
  extraction: unknown;
  /** Tags do que o fornecedor inclui por padrão (coluna suppliers.inclui). */
  supplier_inclui?: readonly string[] | null;
  /** Capacidade máxima de convidados (coluna suppliers.capacidade, só espaço). */
  supplier_capacidade?: number | null;
  /** Tipo de espaço (coluna suppliers.tipo_espaco). */
  supplier_tipo_espaco?: string | null;
}

interface AddOn {
  key: string;
  label: string;
  covers: string;
  priceCents: number;
  /** "fee" = estava somado no total; "scope" = preço à parte, fora do total. */
  source: "fee" | "scope";
}

export interface OfferDetail {
  offerId: string;
  includes: string[];
  excludes: string[];
  addOns: { label: string; covers: string; priceCents: number }[];
}

export interface Variant {
  quote: SupplierQuote;
  offerId: string;
  chosenAddOns: AddOn[];
  skippedAddOns: AddOn[];
}

const extractionSchema = z.object({
  fees: z.array(mandatoryFeeSchema).max(30).optional(),
  quotation: z
    .object({
      scope: z.array(scopeEntrySchema).max(40).optional(),
      per_guest_cents: z.number().int().min(0).max(100_000_000).nullable().optional(),
    })
    .partial()
    .optional(),
});

function parseExtraction(raw: unknown): {
  fees: z.infer<typeof mandatoryFeeSchema>[];
  scope: ScopeEntry[];
  perGuestCents: number | null;
} {
  const parsed = extractionSchema.safeParse(raw);
  if (!parsed.success) return { fees: [], scope: [], perGuestCents: null };
  return {
    fees: parsed.data.fees ?? [],
    scope: parsed.data.quotation?.scope ?? [],
    perGuestCents: parsed.data.quotation?.per_guest_cents ?? null,
  };
}

function supplierTags(row: OfferRow): SupplierIncluiTag[] {
  return (row.supplier_inclui ?? [])
    .map((tag) => normalizeSupplierIncluiTag(tag))
    .filter((tag): tag is SupplierIncluiTag => tag !== null);
}

/** Tag de "inclui" que representa cada categoria (para achar o que falta num buffet). */
const CATEGORY_INCLUI_TAG: Partial<Record<string, SupplierIncluiTag>> = {};
for (const [tag, category] of Object.entries(SUPPLIER_INCLUI_COVERS)) {
  if (category !== undefined) CATEGORY_INCLUI_TAG[category] = tag as SupplierIncluiTag;
}

const GAP_SUBJECTS: Record<string, string> = {
  buffet: "Este buffet",
  espaco: "Este espaço",
  som_dj: "Este DJ",
  banda: "Esta banda",
  barman: "Este bar",
  cantor_cerimonia: "Este cantor",
};

function gapSubject(category: string): string {
  return GAP_SUBJECTS[category] ?? "Este fornecedor";
}

/** Rótulos curtos para as mensagens de lacuna (o rótulo do catálogo é longo demais). */
const GAP_LABELS: Partial<Record<CategoryCode, string>> = {
  espaco: "espaço",
  buffet: "buffet",
  bebidas: "bebidas",
  garcons: "garçons",
  louca: "louça",
  som_dj: "DJ",
  banda: "banda",
  cantor_cerimonia: "cantor de cerimônia",
  barman: "barman",
  mobiliario: "móveis",
  limpeza: "limpeza",
  seguranca: "segurança",
  transporte: "transporte",
  gerador: "gerador",
  decoracao: "decoração",
  bolo_doces: "bolo e doces",
  iluminacao: "iluminação",
};

function gapLabel(categoryName: (c: string) => string, category: string): string {
  const short = GAP_LABELS[category as CategoryCode];
  if (short !== undefined) return short;
  const fromCatalog = CATEGORY_LABELS[category as CategoryCode];
  return (fromCatalog ?? categoryName(category)).toLowerCase();
}

function scopeExcludes(extraction: unknown, category: string): boolean {
  const { scope } = parseExtraction(extraction);
  return scope.some((s) => s.status === "nao_inclui" && SCOPE_COVERS[s.item] === category);
}

export interface CoverageGap {
  category: string;
  message: string;
}

/**
 * Explica lacunas de cobertura em pt-BR e compara a capacidade do espaço com os
 * convidados. Determinístico: mesma entrada ⇒ mesmas mensagens.
 */
export function buildCoverageGaps(
  wanted: readonly string[],
  offers: readonly OfferRow[],
  required: readonly string[],
  guestCount = 0,
  categoryName: (c: string) => string = (c) => c,
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const seen = new Set<string>();
  const push = (category: string, message: string) => {
    const key = `${category}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    gaps.push({ category, message });
  };
  const requiredSet = new Set(required);

  for (const category of wanted) {
    if (requiredSet.has(category)) continue;
    const label = gapLabel(categoryName, category);
    const culprit = offers.find((o) => scopeExcludes(o.extraction, category));
    if (culprit !== undefined) {
      push(
        category,
        `${gapSubject(normalizeCategoryCode(culprit.category) ?? culprit.category)} não inclui ${label}; vamos buscar à parte.`,
      );
      continue;
    }
    const missingTag = CATEGORY_INCLUI_TAG[category];
    const partialBuffet =
      missingTag !== undefined &&
      offers.find(
        (o) =>
          o.category === "buffet" &&
          (o.supplier_inclui ?? []).length > 0 &&
          !supplierTags(o).includes(missingTag),
      ) !== undefined;
    if (partialBuffet) {
      push(category, `Este buffet não inclui ${label}; vamos buscar à parte.`);
      continue;
    }
    push(category, `Não encontramos fornecedor para ${label}; vamos buscar à parte.`);
  }

  for (const offer of offers) {
    if (offer.category !== "espaco") continue;
    const capacity = offer.supplier_capacidade;
    if (
      guestCount > 0 &&
      typeof capacity === "number" &&
      Number.isInteger(capacity) &&
      capacity > 0 &&
      guestCount > capacity
    ) {
      push(
        "espaco",
        `Este espaço comporta até ${capacity} convidados; o evento tem ${guestCount}. Vamos buscar um espaço maior.`,
      );
    }
  }
  return gaps;
}

function subsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let m = 0; m < 1 << items.length; m += 1)
    out.push(items.filter((_, i) => (m & (1 << i)) !== 0));
  return out;
}

/** Expande uma oferta em variantes (com/sem cada adicional relevante). */
export function expandOffer(
  row: OfferRow,
  required: ReadonlySet<string>,
): { variants: Variant[]; detail: OfferDetail } {
  const { fees, scope, perGuestCents } = parseExtraction(row.extraction);
  const included = scope.filter((s) => s.status === "inclui").map((s) => s.item);
  const covers = new Set<string>([normalizeCategoryCode(row.category) ?? row.category]);
  for (const item of included) {
    const c = SCOPE_COVERS[item];
    if (c !== undefined && required.has(c)) covers.add(c);
  }
  for (const tag of supplierTags(row)) {
    const c = SUPPLIER_INCLUI_COVERS[tag];
    if (c !== undefined && required.has(c)) covers.add(c);
  }

  const extraFees = fees.filter((f) => !f.included_in_base);
  const feesSum = extraFees.reduce((s, f) => s + f.amount_cents, 0);
  const consistent = feesSum === row.fees_cents && feesSum <= row.amount_cents;

  const addOns: AddOn[] = [];
  const mandatory: QuoteFee[] = [];
  for (const f of consistent ? extraFees : []) {
    const c = FEE_COVERS[f.category];
    if (c !== undefined && required.has(c) && !covers.has(c)) {
      addOns.push({
        key: `fee:${f.category}`,
        label: f.description,
        covers: c,
        priceCents: f.amount_cents,
        source: "fee",
      });
    } else {
      mandatory.push({
        category: f.category,
        description: f.description,
        amountCents: f.amount_cents,
        includedInBase: false,
      });
    }
  }
  for (const s of scope) {
    const c = SCOPE_COVERS[s.item];
    if (s.status !== "nao_inclui" || s.price_cents === null || c === undefined) continue;
    if (!required.has(c) || covers.has(c) || addOns.some((a) => a.covers === c)) continue;
    addOns.push({
      key: `scope:${s.item}`,
      label: SCOPE_LABELS[s.item],
      covers: c,
      priceCents: s.price_cents,
      source: "scope",
    });
  }
  const limited = addOns.slice(0, MAX_ADDONS_PER_OFFER);

  const mandatorySum = mandatory.reduce((s, f) => s + (f.amountCents ?? 0), 0);
  const feeAddOnSum = limited
    .filter((a) => a.source === "fee")
    .reduce((s, a) => s + a.priceCents, 0);
  // amount_cents já soma as taxas extras: base = total − taxas obrigatórias − taxas viradas adicionais.
  const baseCents = consistent ? row.amount_cents - mandatorySum - feeAddOnSum : row.amount_cents;
  const quality = Math.round(Math.min(1, Math.max(0, row.confidence ?? 0)) * 10_000);

  const variants = subsets(limited).map((chosen) => {
    const suffix = chosen.map((a) => a.key).join("+");
    return {
      offerId: row.id,
      chosenAddOns: chosen,
      skippedAddOns: limited.filter((a) => !chosen.includes(a)),
      quote: {
        supplierId: suffix.length > 0 ? `${row.id}#${suffix}` : row.id,
        supplierName: row.vendor_name,
        covers: [...covers, ...chosen.map((a) => a.covers)],
        basePriceCents: baseCents + chosen.reduce((s, a) => s + a.priceCents, 0),
        totalPriceCents: null,
        fees: consistent ? mandatory : [],
        perGuestCents,
        qualityBps: quality,
      },
    };
  });

  const excludes = scope
    .filter((s) => s.status === "nao_inclui")
    .map((s) =>
      s.price_cents !== null
        ? `${SCOPE_LABELS[s.item]} (${formatBRL(s.price_cents)} à parte)`
        : SCOPE_LABELS[s.item],
    );
  return {
    variants,
    detail: {
      offerId: row.id,
      includes: [...new Set(included)].map((i: ScopeItem) => SCOPE_LABELS[i]),
      excludes,
      addOns: limited.map((a) => ({ label: a.label, covers: a.covers, priceCents: a.priceCents })),
    },
  };
}

export interface SelectionNote {
  supplierId: string;
  offerId: string;
  includes: string[];
  excludes: string[];
  notes: string[];
}

export interface CoverageResult {
  required: string[];
  uncovered: string[];
  /** Lacunas explicadas em pt-BR (ex.: buffet só com comida) e alertas de capacidade. */
  gaps: CoverageGap[];
  outcomes: Record<ScenarioKind, ScenarioOutcome>;
  /** Detalhes por seleção (chave = supplierId da seleção/variante). */
  details: Record<ScenarioKind, Record<string, SelectionNote>>;
  /** true quando não houve combinação sem sobreposição e foi preciso aceitar redundância. */
  overlapFallback: Record<ScenarioKind, boolean>;
}

const CATEGORY_NAME = (c: string) => c;

export function composeWithCoverage(
  wanted: readonly string[],
  offers: readonly OfferRow[],
  categoryName: (c: string) => string = CATEGORY_NAME,
  guestCount = 0,
): CoverageResult {
  const normalizedWanted = [
    ...new Set(wanted.map((c) => normalizeCategoryCode(c) ?? c)),
  ];
  const wantedSet = new Set(normalizedWanted);
  const expanded = offers.map((o) => expandOffer(o, wantedSet));
  const coverable = new Set(expanded.flatMap((e) => e.variants.flatMap((v) => v.quote.covers)));
  const required = normalizedWanted
    .filter((c) => coverable.has(c))
    .slice(0, MAX_REQUIRED_CATEGORIES);
  const uncovered = normalizedWanted.filter((c) => !required.includes(c));
  const gaps = buildCoverageGaps(normalizedWanted, offers, required, guestCount, categoryName);
  const variants = expanded.flatMap((e) => e.variants);
  const byVariant = new Map(variants.map((v) => [v.quote.supplierId, v]));
  const detailByOffer = new Map(expanded.map((e) => [e.detail.offerId, e.detail]));
  const quotes = variants.map((v) => v.quote);

  const exact = buildAllScenarios(
    required,
    quotes,
    { alreadyOwned: [], unneededFeeCategories: [] },
    { exactCover: true, guestCount },
  );
  const loose = buildAllScenarios(required, quotes, {
    alreadyOwned: [],
    unneededFeeCategories: [],
  }, { guestCount });
  const kinds: ScenarioKind[] = ["preco", "custo_beneficio", "comodidade"];
  const outcomes = {} as Record<ScenarioKind, ScenarioOutcome>;
  const details = {} as CoverageResult["details"];
  const overlapFallback = {} as CoverageResult["overlapFallback"];

  for (const kind of kinds) {
    const useLoose = exact[kind].scenario === null && loose[kind].scenario !== null;
    const outcome = useLoose ? loose[kind] : exact[kind];
    outcomes[kind] = outcome;
    overlapFallback[kind] = useLoose;
    const sels = outcome.scenario?.selections ?? [];
    const coveredBy = new Map<string, string>();
    for (const s of sels)
      for (const c of byVariant.get(s.supplierId)?.quote.covers ?? [])
        if (!coveredBy.has(c)) coveredBy.set(c, s.supplierName);
    const kindDetails: Record<string, SelectionNote> = {};
    for (const s of sels) {
      const v = byVariant.get(s.supplierId);
      if (v === undefined) continue;
      const d = detailByOffer.get(v.offerId);
      const notes: string[] = [];
      for (const a of v.chosenAddOns)
        notes.push(`Inclui à parte: ${a.label} (${formatBRL(a.priceCents)}).`);
      for (const a of v.skippedAddOns) {
        const other = coveredBy.get(a.covers);
        notes.push(
          other !== undefined && other !== s.supplierName
            ? `${a.label} (${formatBRL(a.priceCents)}) dispensado: ${categoryName(a.covers)} já incluso em ${other}.`
            : `${a.label} (${formatBRL(a.priceCents)}) não contratado.`,
        );
      }
      if (useLoose)
        notes.push("Atenção: sem combinação sem sobreposição; há serviço possivelmente duplicado.");
      kindDetails[s.supplierId] = {
        supplierId: s.supplierId,
        offerId: v.offerId,
        includes: d?.includes ?? [],
        excludes: d?.excludes ?? [],
        notes,
      };
    }
    details[kind] = kindDetails;
  }
  return { required, uncovered, gaps, outcomes, details, overlapFallback };
}
