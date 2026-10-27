/** Tipos do motor determinístico financeiro (ver .context/ARCHITECTURE.md §5). */

export type EventType =
  | "festa_infantil"
  | "quinze_anos"
  | "casamento"
  | "aniversario"
  | "corporativo"
  | "batizado"
  | "formatura";

export type RegionCode = "sp" | "rj" | "mg" | "outros";

export type ItemCategory = "buffet" | "decoracao" | "musica" | "fotografia" | "espaco";

export type PreferenceLevel = "economico" | "equilibrado" | "premium";

export interface EngineItemSelection {
  category: ItemCategory;
}

export interface EngineInput {
  eventType: EventType;
  guestCount: number;
  /** Data local do evento no formato YYYY-MM-DD (normalizada pelo chamador). */
  eventDateIso: string;
  /** Dias entre hoje e o evento — injetado pelo chamador (o motor não lê relógio). */
  leadTimeDays: number;
  region: RegionCode;
  items: EngineItemSelection[];
  preferences?: Partial<Record<ItemCategory, PreferenceLevel>>;
}

export interface EngineParamsItem {
  label: string;
  fixedCents: number;
  perGuestCents: number;
}

export interface EngineParams {
  version: string;
  regionFactorPpm: Record<RegionCode, number>;
  eventTypeFactorPpm: Record<EventType, number>;
  urgencyDays: number;
  urgencyFactorPpm: number;
  /** 12 posições — janeiro (índice 0) a dezembro (índice 11). */
  monthFactorPpm: readonly number[];
  items: Record<ItemCategory, EngineParamsItem>;
  minFactorPpm: number;
  maxFactorPpm: number;
}

export interface EngineLineItem {
  category: ItemCategory;
  label: string;
  suggestedCents: number;
  minCents: number;
  maxCents: number;
}

export type EngineWarningCode = "urgency" | "peak_season" | "large_event";

export interface EngineWarning {
  code: EngineWarningCode;
  message: string;
}

export interface EngineResult {
  engineVersion: string;
  currency: "BRL";
  totalCents: number;
  minTotalCents: number;
  maxTotalCents: number;
  breakdown: EngineLineItem[];
  warnings: EngineWarning[];
}

/* ============================================================
 * Cotações reais de fornecedores (calculator.ts / scenarios.ts)
 * Inteiros em centavos; taxas percentuais em basis points (1% = 100 bps).
 * ============================================================ */

export type QuoteFeeCategory =
  | "cleaning"
  | "dishes_and_cutlery"
  | "delivery_pickup"
  | "service_staff"
  | "other";

export interface QuoteFee {
  category: QuoteFeeCategory;
  description: string;
  /** Valor fixo em centavos. Se null, usa `rateBps` sobre o valor base. */
  amountCents: number | null;
  /** Percentual sobre o base, em bps (ex.: 10% de serviço = 1000). */
  rateBps?: number | null;
  includedInBase: boolean;
}

export interface SupplierQuote {
  supplierId: string;
  supplierName: string;
  /** Categorias de serviço que a proposta cobre (pacote = várias). */
  covers: string[];
  basePriceCents: number | null;
  totalPriceCents: number | null;
  /**
   * Custo por convidado (V_pessoa) quando a proposta é "por cabeça". Null/ausente
   * ⇒ a proposta não precifica por pessoa (só base + taxas). Somado como
   * `perGuestCents * guestCount` no C_total. Opcional por compatibilidade até a
   * extração passar a emitir o campo (fase seguinte).
   */
  perGuestCents?: number | null;
  fees: QuoteFee[];
  /** Qualidade/confiança 0..10000 bps (ex.: confidence_score × 10000, inteiro). */
  qualityBps: number | null;
}

export interface UserAssets {
  /** Categorias de serviço que a família já tem (ex.: "decoracao") ⇒ custo 0. */
  alreadyOwned: string[];
  /** Taxas que não se aplicam (ex.: já tem louça) ⇒ ignoradas. */
  unneededFeeCategories: QuoteFeeCategory[];
}

export type MissingField = "base_price_cents" | "fee_amount" | "quality_bps" | "quote";

export interface MissingInfo {
  category: string;
  supplierId: string | null;
  field: MissingField;
}

export type EffectiveCostResult =
  | {
      ok: true;
      effectiveCents: number;
      baseCents: number;
      hiddenFeesCents: number;
      ignoredFeesCents: number;
    }
  | { ok: false; missing: MissingField[] };

export type ScenarioKind = "preco" | "custo_beneficio" | "comodidade";

export interface ScenarioSelection {
  supplierId: string;
  supplierName: string;
  categories: string[];
  effectiveCents: number;
}

export interface Scenario {
  kind: ScenarioKind;
  totalCents: number;
  supplierCount: number;
  /** Score determinístico (custo ajustado pela qualidade) — só em custo_beneficio. */
  scoreCents: number | null;
  selections: ScenarioSelection[];
  ownedCategories: string[];
}

export interface ScenarioOutcome {
  kind: ScenarioKind;
  scenario: Scenario | null;
  missing: MissingInfo[];
}
