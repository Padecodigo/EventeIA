/**
 * Orçamento único de menor preço (puro e determinístico).
 *
 * Para cada necessidade, escolhe a combinação de cotações válidas com o menor
 * custo efetivo total. Em empate, prefere menos fornecedores e mantém a ordem
 * estável de supplierId. Dados insuficientes ⇒ orçamento null + faltantes.
 * Nunca estima.
 */

import { effectiveCost } from "./calculator";
import type {
  MissingInfo,
  Scenario,
  ScenarioKind,
  ScenarioOutcome,
  SupplierQuote,
  UserAssets,
} from "./types";

export const MAX_REQUIRED_CATEGORIES = 12;

const KIND: ScenarioKind = "preco";

interface Candidate {
  quote: SupplierQuote;
  mask: number;
  categories: string[];
  effectiveCents: number;
}

interface DpCell {
  count: number;
  cost: number;
  picks: number[];
}

function better(a: DpCell, b: DpCell | undefined): boolean {
  if (b === undefined) return true;
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.count !== b.count) return a.count < b.count;
  return false; // empate: mantém o primeiro (ordem estável por supplierId)
}

export interface ScenarioOptions {
  /** Cobertura exata: nenhuma categoria paga duas vezes (sem sobreposição entre escolhidos). */
  exactCover?: boolean;
  /** N de convidados do evento (V_pessoa·N). 0 = propostas sem preço por cabeça. */
  guestCount?: number;
}

function solve(required: string[], candidates: Candidate[], exact = false): number[] | null {
  const full = (1 << required.length) - 1;
  const dp: (DpCell | undefined)[] = new Array<DpCell | undefined>(full + 1).fill(undefined);
  dp[0] = { count: 0, cost: 0, picks: [] };

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
        picks: [...cell.picks, index],
      };
      if (better(proposal, dp[next])) dp[next] = proposal;
    });
  }

  return dp[full]?.picks ?? null;
}

function buildCandidates(
  required: string[],
  quotes: SupplierQuote[],
  assets: UserAssets,
  missing: MissingInfo[],
  guestCount: number,
): Candidate[] {
  const candidates: Candidate[] = [];
  const sorted = [...quotes].sort((a, b) =>
    a.supplierId < b.supplierId ? -1 : a.supplierId > b.supplierId ? 1 : 0,
  );

  for (const quote of sorted) {
    const categories = required.filter((category) => quote.covers.includes(category));
    if (categories.length === 0) continue;
    const mask = categories.reduce((acc, category) => acc | (1 << required.indexOf(category)), 0);

    const cost = effectiveCost(quote, assets, guestCount);
    if (!cost.ok) {
      for (const field of cost.missing) {
        missing.push({ category: categories.join("+"), supplierId: quote.supplierId, field });
      }
      continue;
    }

    candidates.push({ quote, mask, categories, effectiveCents: cost.effectiveCents });
  }
  return candidates;
}

export function buildLowestPriceScenario(
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
    throw new Error(`máximo de ${String(MAX_REQUIRED_CATEGORIES)} categorias por orçamento`);
  }

  const guestCount = options.guestCount ?? 0;
  if (!Number.isInteger(guestCount) || guestCount < 0) {
    throw new Error("guestCount deve ser inteiro não-negativo");
  }

  const missing: MissingInfo[] = [];
  const candidates = buildCandidates(required, quotes, assets, missing, guestCount);

  // Categorias sem nenhuma cotação utilizável.
  for (const [index, category] of required.entries()) {
    if (!candidates.some((candidate) => (candidate.mask & (1 << index)) !== 0)) {
      if (!missing.some((info) => info.category.split("+").includes(category))) {
        missing.push({ category, supplierId: null, field: "quote" });
      }
    }
  }

  const picks = solve(required, candidates, options.exactCover === true);
  if (picks === null) {
    return { kind: KIND, scenario: null, missing };
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
    kind: KIND,
    totalCents: chosen.reduce((sum, candidate) => sum + candidate.effectiveCents, 0),
    supplierCount: chosen.length,
    selections,
    ownedCategories,
  };

  return { kind: KIND, scenario, missing: [] };
}
