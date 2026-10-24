import { randomInt } from "node:crypto";

/** Cupom sorteado ("Quer cupom?") — regras puras. */
export const LUCKY_MIN_PERCENT = 20;
export const LUCKY_MAX_PERCENT = 40;
export const LUCKY_CODE_PREFIX = "SORTE-";
/** Janela entre sorteios: dentro dela, tentar de novo devolve o mesmo cupom. */
export const LUCKY_REDRAW_WINDOW_HOURS = 48;
/** Validade do cupom sorteado (nunca maior que a janela; o banco também valida). */
export const LUCKY_VALIDITY_HOURS = 24;

export type LuckyStatus =
  "available" | "active" | "expired" | "redeemed" | "ineligible" | "unavailable";

/** Sorteio criptograficamente seguro, inteiro, 20..40 inclusive. `rng` injetável em teste. */
export function drawLuckyPercent(rng: (min: number, max: number) => number = randomInt): number {
  const value = rng(LUCKY_MIN_PERCENT, LUCKY_MAX_PERCENT + 1);
  if (!isValidLuckyPercent(value)) {
    throw new Error("sorteio fora do intervalo");
  }
  return value;
}

export function isValidLuckyPercent(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= LUCKY_MIN_PERCENT &&
    (value as number) <= LUCKY_MAX_PERCENT
  );
}

/** Desconto (centavos, arredondado para baixo) do percentual GRAVADO no banco. */
export function luckyDiscountCents(priceCents: number, percent: number): number {
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new Error("priceCents deve ser inteiro positivo");
  }
  if (!isValidLuckyPercent(percent)) {
    throw new Error("percentual inválido");
  }
  return Math.floor((priceCents * percent) / 100);
}

export function isLuckyCode(code: string | null | undefined): boolean {
  return typeof code === "string" && code.startsWith(LUCKY_CODE_PREFIX);
}
