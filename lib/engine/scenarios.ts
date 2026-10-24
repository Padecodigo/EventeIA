/**
 * Cenários de contratação (puros e determinísticos):
 * - preco: menor custo efetivo total;
 * - custo_beneficio: menor custo ajustado pela qualidade (score determinístico);
 * - comodidade: menor número de fornecedores (desempate pelo custo).
 * Dados insuficientes ⇒ cenário null + campos faltantes. Nunca estima.
 */

import { applyBps, BPS_DENOMINATOR, effectiveCost } from "./calculator";
import type {
  MissingInfo,
  Scenario,
  ScenarioKind,
  ScenarioOutcome,
  SupplierQuote,
  UserAssets,
} from "./types";

export const MAX_REQUIRED_CATEGORIES = 12;

interface Candidate {
  quote: SupplierQuote;
  mask: number;
  categories: string[];
  effectiveCents: number;
  scoreCents: number | null;
}

interface DpCell {
  count: number;
  cost: number;
  score: number;
  picks: number[];
}

/** Score do custo-benefício: custo × (2 − qualidade). Qualidade 100% ⇒ custo puro. */
export function valueScoreCents(effectiveCents: number, qualityBps: number): number {
  if (!Number.isInteger(qualityBps) || qualityBps < 0 || qualityBps > BPS_DENOMINATOR) {
    throw new Error("qualityBps deve ser inteiro entre 0 e 10000");
  }
  return applyBps(effectiveCents, 2 * BPS_DENOMINATOR - qualityBps);
}

function better(kind: ScenarioKind, a: DpCell, b: DpCell | undefined): boolean {
  if (b === undefined) return true;
  const keyA =
    kind === "comodidade"
      ? [a.count, a.cost]
      : kind === "preco"
        ? [a.cost, a.count]
        : [a.score, a.cost, a.count];
  const keyB =
    kind === "comodidade"
      ? [b.count, b.cost]
      : kind === "preco"
        ? [b.cost, b.count]
        : [b.score, b.cost, b.count];
  for (let i = 0; i < keyA.length; i += 1) {
    const x = keyA[i] ?? 0;
    const y = keyB[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false; // empate: mantém o primeiro (ordem estável por supplierId)
}

export interface ScenarioOptions {
  /** Cobertura exata: nenhuma categoria paga duas vezes (sem sobreposição entre escolhidos). */
  exactCover?: boolean;
}

function solve(
  kind: ScenarioKind,
  required: string[],
  candidates: Candidate[],
  exact = false,
): number[] | null {
  const full = (1 << required.length) - 1;
  const dp: (DpCell | undefined)[] = new Array<DpCell | undefined>(full + 1).fill(undefined);
  dp[0] = { count: 0, cost: 0, score: 0, picks: [] };

  for (let mask = 0; mask <= full; mask += 1) {
    const cell = dp[mask];
    if (cell === undefined) continue;
    candidates.forEach((candidate, index) => {
      if ((candidate.mask & ~mask) === 0) return; // não acrescenta cobertura
      if (exact && (candidate.mask & mask) !== 0) return; // sobreposição proibida
      if (cell.picks.includes(index)) return;
      const next = mask | candidate.mask;
      const proposal: DpCell = {
        count: cell.count + 1,
        cost: cell.cost + candidate.effectiveCents,
        score: cell.score + (candidate.scoreCents ?? 0),
        picks: [...cell.picks, index],
      };
      if (better(kind, proposal, dp[next])) dp[next] = proposal;
    });
  }

  return dp[full]?.picks ?? null;
}

function buildCandidates(
  kind: ScenarioKind,
  required: string[],
  quotes: SupplierQuote[],
  assets: UserAssets,
  missing: MissingInfo[],
): Candidate[] {
  const candidates: Candidate[] = [];
  const sorted = [...quotes].sort((a, b) =>
    a.supplierId < b.supplierId ? -1 : a.supplierId > b.supplierId ? 1 : 0,
  );

  for (const quote of sorted) {
    const categories = required.filter((category) => quote.covers.includes(category));
    if (categories.length === 0) continue;
    const mask = categories.reduce((acc, category) => acc | (1 << required.indexOf(category)), 0);

    const cost = effectiveCost(quote, assets);
    if (!cost.ok) {
      for (const field of cost.missing) {
        missing.push({ category: categories.join("+"), supplierId: quote.supplierId, field });
      }
      continue;
    }

    let scoreCents: number | null = null;
    if (kind === "custo_beneficio") {
      if (quote.qualityBps === null) {
        missing.push({
          category: categories.join("+"),
          supplierId: quote.supplierId,
          field: "quality_bps",
        });
        continue;
      }
      scoreCents = valueScoreCents(cost.effectiveCents, quote.qualityBps);
    }

    candidates.push({ quote, mask, categories, effectiveCents: cost.effectiveCents, scoreCents });
  }
  return candidates;
}

export function buildScenario(
  kind: ScenarioKind,
  requiredCategories: string[],
  quotes: SupplierQuote[],
  assets: UserAssets,
  options: ScenarioOptions = {},
): ScenarioOutcome {
  const owned = new Set(assets.alreadyOwned);
  const unique = [...new Set(requiredCategories)];
  const ownedCategories = unique.filter((category) => owned.has(category));
  const required = unique.filter((category) => !owned.has(category));

  if (required.length > MAX_REQUIRED_CATEGORIES) {
    throw new Error(`máximo de ${String(MAX_REQUIRED_CATEGORIES)} categorias por cenário`);
  }

  const missing: MissingInfo[] = [];
  const candidates = buildCandidates(kind, required, quotes, assets, missing);

  // Categorias sem nenhuma cotação utilizável.
  for (const [index, category] of required.entries()) {
    if (!candidates.some((candidate) => (candidate.mask & (1 << index)) !== 0)) {
      if (!missing.some((info) => info.category.split("+").includes(category))) {
        missing.push({ category, supplierId: null, field: "quote" });
      }
    }
  }

  const picks = solve(kind, required, candidates, options.exactCover === true);
  if (picks === null) {
    return { kind, scenario: null, missing };
  }

  const chosen = picks
    .map((index) => candidates[index])
    .filter((c): c is Candidate => c !== undefined);
  const covered = new Set<string>();
  const selections = chosen.map((candidate) => {
    const categories = candidate.categories.filter((category) => !covered.has(category));
    categories.forEach((category) => covered.add(category));
    return {
      supplierId: candidate.quote.supplierId,
      supplierName: candidate.quote.supplierName,
      categories,
      effectiveCents: candidate.effectiveCents,
    };
  });

  const scenario: Scenario = {
    kind,
    totalCents: chosen.reduce((sum, candidate) => sum + candidate.effectiveCents, 0),
    supplierCount: chosen.length,
    scoreCents:
      kind === "custo_beneficio" ? chosen.reduce((sum, c) => sum + (c.scoreCents ?? 0), 0) : null,
    selections,
    ownedCategories,
  };

  return { kind, scenario, missing: [] };
}

export function buildAllScenarios(
  requiredCategories: string[],
  quotes: SupplierQuote[],
  assets: UserAssets,
  options: ScenarioOptions = {},
): Record<ScenarioKind, ScenarioOutcome> {
  return {
    preco: buildScenario("preco", requiredCategories, quotes, assets, options),
    custo_beneficio: buildScenario("custo_beneficio", requiredCategories, quotes, assets, options),
    comodidade: buildScenario("comodidade", requiredCategories, quotes, assets, options),
  };
}
