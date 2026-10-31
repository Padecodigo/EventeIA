/**
 * Orçamento limite do evento (0072): validação da entrada e sinalização de opções.
 *
 * Regra de produto: o limite NUNCA esconde opções nem decide pelo usuário — apenas
 * sinaliza "acima do seu limite". A comparação usa o preço TOTAL do evento
 * (por pessoa × convidados), conforme decisão do dono (31/10/2026).
 */

const BUDGET_LIMIT_MIN_CENTS = 10_000; // R$ 100
const BUDGET_LIMIT_MAX_CENTS = 100_000_000_000; // R$ 1 bilhão
export const ABOVE_LIMIT_LABEL = "acima do seu limite";

export type BudgetLimitParse =
  | { ok: true; cents: number | null }
  | { ok: false; error: string };

/**
 * Aceita "15000", "15.000", "15.000,50", "R$ 15.000,50" ou vazio (= sem limite).
 * Retorna centavos inteiros.
 */
export function parseBudgetLimitInput(raw: FormDataEntryValue | null | undefined): BudgetLimitParse {
  if (raw === null || raw === undefined || typeof raw !== "string") return { ok: true, cents: null };
  const cleaned = raw.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (cleaned === "") return { ok: true, cents: null };
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: "Informe o orçamento limite em reais, ex.: 25.000 ou 25.000,00." };
  }
  const [intPart = "0", decPart = ""] = cleaned.replace(/\./g, "").split(",");
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < BUDGET_LIMIT_MIN_CENTS || cents > BUDGET_LIMIT_MAX_CENTS) {
    return { ok: false, error: "O orçamento limite deve ficar entre R$ 100 e R$ 1 bilhão." };
  }
  return { ok: true, cents };
}

/** Valor para preencher o campo de edição (ex.: 2500000 → "25.000,00"). */
export function formatBudgetLimitInput(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type OptionUnit = string;

/**
 * Preço total estimado da opção para o evento. Por pessoa × convidados;
 * por hora/unidade/pacote usam o preço informado (piso conservador).
 * Null quando o preço é "a combinar".
 */
export function optionEventTotalCents(
  priceCents: number | null,
  unit: OptionUnit,
  guestCount: number,
): number | null {
  if (priceCents === null) return null;
  if (unit === "por_pessoa") return priceCents * Math.max(1, guestCount);
  return priceCents;
}

/** true quando a opção, no total do evento, passa do limite. Sem limite/preço → false. */
export function isAboveBudgetLimit(
  priceCents: number | null,
  unit: OptionUnit,
  guestCount: number,
  limitCents: number | null,
): boolean {
  if (limitCents === null) return false;
  const total = optionEventTotalCents(priceCents, unit, guestCount);
  return total !== null && total > limitCents;
}
