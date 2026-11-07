import { roundHalfUpDiv } from "@/lib/money";
import { DISCOUNT_FLOOR_CENTS } from "@/lib/pricing";

/**
 * Ofertas do usuário logado (migração 0036) — regras puras.
 * Valores gravados no banco por oferta; estas constantes espelham a migração.
 * A oferta de boas-vindas é o único desconto do produto: 20% do ticket.
 */
export const WELCOME_PERCENT = 20;
/** 20% do ticket avulso (R$ 97) — o banco pode ter gravado mais; o app limita a 20%. */
export const WELCOME_AVULSO_OFF_CENTS = 1_940;
export const WELCOME_PACK_PERCENT = WELCOME_PERCENT;
/** Oferta pessoal legada (0036): valores de referência; o app não emite mais. */
export const PERSONAL_AVULSO_OFF_CENTS = 2_000;
export const PERSONAL_PACK_PERCENT = WELCOME_PERCENT;
export const OFFER_WINDOW_HOURS = 48;

/** Mesmo piso dos cupons: nunca abaixo de R$ 47 (DISCOUNT_FLOOR_CENTS). */
export const OFFER_MIN_FINAL_CENTS = DISCOUNT_FLOOR_CENTS;

export type OfferKind = "welcome" | "personal";
/** avulso = ticket de 1 evento; pack = pacote/slider/1ª fatura da franquia. */
export type OfferCategory = "avulso" | "pack";

export interface OfferTerms {
  avulsoOffCents: number;
  packPercent: number;
}

/**
 * Desconto da oferta para o preço dado (inteiro, nunca deixa abaixo do piso).
 * Avulso nunca ultrapassa WELCOME_PERCENT% do preço — protege ofertas antigas
 * gravadas com valor fixo maior (ex.: R$ 40).
 */
export function offerDiscountCents(
  offer: OfferTerms,
  category: OfferCategory,
  priceCents: number,
): number {
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new Error("priceCents deve ser inteiro positivo");
  }
  const raw =
    category === "avulso"
      ? Math.min(offer.avulsoOffCents, roundHalfUpDiv(priceCents * WELCOME_PERCENT, 100))
      : roundHalfUpDiv(priceCents * Math.min(offer.packPercent, 90), 100);
  return Math.max(0, Math.min(raw, priceCents - OFFER_MIN_FINAL_CENTS));
}

/**
 * Sem acumular: aplica o MAIOR desconto entre cupom digitado e oferta pessoal.
 * Empate ⇒ cupom digitado (a oferta continua guardada para outra compra).
 */
export function pickBetterDiscount(
  couponCents: number | null,
  offerCents: number | null,
): "coupon" | "offer" | null {
  const c = couponCents ?? -1;
  const o = offerCents ?? -1;
  if (c <= 0 && o <= 0) return null;
  return o > c ? "offer" : "coupon";
}

/** Texto honesto do benefício (sem urgência inventada). */
export function offerHeadline(): string {
  return `${WELCOME_PERCENT}% de desconto nas primeiras ${OFFER_WINDOW_HOURS}h após o primeiro acesso.`;
}

/** Texto público (visitante) da boas-vindas — espelha as constantes acima, sem contagem. */
export function welcomeVisitorCopy(): string {
  return `${WELCOME_PERCENT}% de desconto nas primeiras ${OFFER_WINDOW_HOURS}h após o primeiro acesso.`;
}
