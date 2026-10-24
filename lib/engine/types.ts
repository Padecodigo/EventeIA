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
