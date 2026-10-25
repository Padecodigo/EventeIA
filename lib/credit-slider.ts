/**
 * Pacote de créditos sob medida (slider "Precisa de créditos extras agora?").
 * Fonte única da verdade do preço: o servidor SEMPRE recalcula por aqui;
 * o preço enviado pelo cliente nunca é usado.
 *
 * Âncoras (R$): 3 = 117, 7 = 197, 17 = 397, 20 = 450 (iguais aos pacotes fixos).
 * Intermediários: interpolação linear por trechos entre âncoras, arredondada
 * (half-up, só inteiros) para reais cheios.
 */
import { roundHalfUpDiv } from "@/lib/money";

/** Preço do tíquete avulso B2C (referência da economia exibida). */
export const SINGLE_TICKET_CENTS = 9_700;

export const CUSTOM_CREDITS_MIN = 3;
export const CUSTOM_CREDITS_MAX = 20;

/** [quantidade, preço em reais] */
export const CUSTOM_CREDITS_ANCHORS: readonly (readonly [number, number])[] = [
  [3, 117],
  [7, 197],
  [17, 397],
  [20, 450],
];

export interface CustomCreditsQuote {
  credits: number;
  priceCents: number;
  perEventCents: number;
  singleTicketTotalCents: number;
  savingsCents: number;
}

export function isValidCustomCredits(credits: unknown): credits is number {
  return (
    typeof credits === "number" &&
    Number.isInteger(credits) &&
    credits >= CUSTOM_CREDITS_MIN &&
    credits <= CUSTOM_CREDITS_MAX
  );
}

export function customCreditsPriceCents(credits: number): number {
  if (!isValidCustomCredits(credits)) {
    throw new Error(
      `quantidade fora do intervalo ${String(CUSTOM_CREDITS_MIN)}..${String(CUSTOM_CREDITS_MAX)}`,
    );
  }
  for (let i = 0; i < CUSTOM_CREDITS_ANCHORS.length - 1; i++) {
    const [n0, p0] = CUSTOM_CREDITS_ANCHORS[i];
    const [n1, p1] = CUSTOM_CREDITS_ANCHORS[i + 1];
    if (credits >= n0 && credits <= n1) {
      const span = n1 - n0;
      const reais = roundHalfUpDiv(p0 * span + (credits - n0) * (p1 - p0), span);
      return reais * 100;
    }
  }
  throw new Error("âncoras inconsistentes");
}

export function quoteCustomCredits(credits: number): CustomCreditsQuote {
  const priceCents = customCreditsPriceCents(credits);
  const singleTicketTotalCents = SINGLE_TICKET_CENTS * credits;
  return {
    credits,
    priceCents,
    perEventCents: roundHalfUpDiv(priceCents, credits),
    singleTicketTotalCents,
    savingsCents: singleTicketTotalCents - priceCents,
  };
}

export function customCreditsTable(): CustomCreditsQuote[] {
  const rows: CustomCreditsQuote[] = [];
  for (let n = CUSTOM_CREDITS_MIN; n <= CUSTOM_CREDITS_MAX; n++) rows.push(quoteCustomCredits(n));
  return rows;
}
