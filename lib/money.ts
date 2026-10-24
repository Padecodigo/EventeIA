/**
 * Dinheiro em centavos inteiros (AGENTS.md §3.2).
 * Proibido float para valores monetários; arredondamento half-up via inteiros.
 */

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formata centavos inteiros como BRL: formatBRL(4700) → "R$ 47,00". */
export function formatBRL(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`formatBRL recebeu valor não inteiro: ${String(cents)}`);
  }
  return brl.format(cents / 100);
}

/**
 * Divisão inteira com arredondamento half-up, sem ponto flutuante.
 * roundHalfUpDiv(735_377_500, 1000) → 735378
 */
export function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new Error("roundHalfUpDiv exige inteiros");
  }
  if (denominator <= 0) {
    throw new Error("roundHalfUpDiv exige denominador positivo");
  }
  const half = Math.trunc(denominator / 2);
  const adjusted = numerator >= 0 ? numerator + half : numerator - half;
  return Math.trunc(adjusted / denominator);
}

/** Aplica um fator em partes por milhar (ppm) com half-up. */
export function applyPpm(value: number, ppm: number): number {
  return roundHalfUpDiv(value * ppm, 1000);
}

/** Converte créditos B2B em centavos (1 crédito = 100 centavos). */
export function creditsToCents(credits: number): number {
  if (!Number.isInteger(credits) || credits < 0) {
    throw new Error("créditos devem ser inteiros não-negativos");
  }
  return credits * 100;
}

/**
 * Converte texto digitado em BRL para centavos inteiros, sem float.
 * Aceita "1.234,56", "1234,56", "1234.56" e "1234".
 */
export function parseBRLToCents(input: string): number {
  const normalized = input.replace(/[^\d.,]/g, "").trim();
  if (normalized.length === 0) {
    throw new Error("valor vazio");
  }

  const decimalSeparator = normalized.includes(",") ? "," : ".";
  const parts = normalized.split(decimalSeparator);
  const integerPart = (parts[0] ?? "0").replace(/\./g, "").replace(/,/g, "") || "0";
  const fractionPart = (parts[1] ?? "").replace(/\D/g, "").padEnd(2, "0").slice(0, 2);

  if (!/^\d+$/.test(integerPart) || !/^\d{2}$/.test(fractionPart)) {
    throw new Error(`valor inválido: ${input}`);
  }

  return Number(integerPart) * 100 + Number(fractionPart);
}
