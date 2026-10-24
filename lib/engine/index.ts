import { applyPpm } from "@/lib/money";

import { ENGINE_PARAMS_V1 } from "./params/v1";
import type {
  EngineInput,
  EngineLineItem,
  EngineParams,
  EngineResult,
  EngineWarning,
  PreferenceLevel,
} from "./types";

export const ENGINE_VERSION = ENGINE_PARAMS_V1.version;

const PREFERENCE_FACTOR_PPM: Record<PreferenceLevel, number> = {
  economico: 900,
  equilibrado: 1000,
  premium: 1200,
};

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function assertInteger(value: number, min: number, max: number, field: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} deve ser inteiro entre ${String(min)} e ${String(max)}`);
  }
}

function assertInput(input: EngineInput): void {
  assertInteger(input.guestCount, 1, 5000, "guestCount");
  if (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0) {
    throw new Error("leadTimeDays deve ser inteiro não-negativo");
  }
  if (!DATE_ISO.test(input.eventDateIso)) {
    throw new Error("eventDateIso deve estar no formato YYYY-MM-DD");
  }
  if (input.items.length === 0) {
    throw new Error("O evento precisa de pelo menos um item selecionado");
  }
  const seen = new Set<string>();
  for (const item of input.items) {
    if (seen.has(item.category)) {
      throw new Error(`Item duplicado: ${item.category}`);
    }
    seen.add(item.category);
  }
}

function monthIndexFromIso(eventDateIso: string): number {
  // Parse determinístico de data já validada; nada de relógio/aleatoriedade.
  const parsed = new Date(`${eventDateIso}T00:00:00Z`);
  return parsed.getUTCMonth();
}

/**
 * Motor determinístico financeiro (puro, sem I/O).
 * Mesma entrada + mesmos parâmetros ⇒ exatamente o mesmo resultado.
 */
export function calculate(input: EngineInput, params: EngineParams = ENGINE_PARAMS_V1): EngineResult {
  assertInput(input);

  const monthIndex = monthIndexFromIso(input.eventDateIso);
  const monthFactorPpm = params.monthFactorPpm[monthIndex];
  if (monthFactorPpm === undefined) {
    throw new Error("monthFactorPpm deve conter 12 posições");
  }

  const urgent = input.leadTimeDays < params.urgencyDays;
  const urgencyFactorPpm = urgent ? params.urgencyFactorPpm : 1000;
  const typeFactorPpm = params.eventTypeFactorPpm[input.eventType];
  const regionFactorPpm = params.regionFactorPpm[input.region];

  const breakdown: EngineLineItem[] = input.items.map((selection) => {
    const itemParams = params.items[selection.category];
    const baseCents = itemParams.fixedCents + itemParams.perGuestCents * input.guestCount;

    let cents = applyPpm(baseCents, regionFactorPpm);
    cents = applyPpm(cents, typeFactorPpm);
    cents = applyPpm(cents, monthFactorPpm);
    cents = applyPpm(cents, urgencyFactorPpm);

    const preference = input.preferences?.[selection.category] ?? "equilibrado";
    cents = applyPpm(cents, PREFERENCE_FACTOR_PPM[preference]);

    return {
      category: selection.category,
      label: itemParams.label,
      suggestedCents: cents,
      minCents: applyPpm(cents, params.minFactorPpm),
      maxCents: applyPpm(cents, params.maxFactorPpm),
    };
  });

  const warnings: EngineWarning[] = [];
  if (urgent) {
    warnings.push({
      code: "urgency",
      message: `Evento em menos de ${String(params.urgencyDays)} dias: inclui acréscimo de urgência.`,
    });
  }
  if (monthFactorPpm >= 1080) {
    warnings.push({
      code: "peak_season",
      message: "Data em alta temporada: custos de fornecedores tendem ao topo da faixa.",
    });
  }
  if (input.guestCount > 600) {
    warnings.push({
      code: "large_event",
      message: "Evento de grande porte: recomendamos orçamento detalhado com fornecedores.",
    });
  }

  return {
    engineVersion: params.version,
    currency: "BRL",
    totalCents: breakdown.reduce((total, line) => total + line.suggestedCents, 0),
    minTotalCents: breakdown.reduce((total, line) => total + line.minCents, 0),
    maxTotalCents: breakdown.reduce((total, line) => total + line.maxCents, 0),
    breakdown,
    warnings,
  };
}
