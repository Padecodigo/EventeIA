import { roundHalfUpDiv } from "@/lib/money";
import { DISCOUNT_FLOOR_CENTS } from "@/lib/pricing";

/**
 * Ofertas pessoais do usuário logado (migração 0036) — regras puras.
 * Valores gravados no banco por oferta; estas constantes espelham a migração.
 */
export const WELCOME_AVULSO_OFF_CENTS = 4_000;
export const WELCOME_PACK_PERCENT = 30;
export const PERSONAL_AVULSO_OFF_CENTS = 2_000;
export const PERSONAL_PACK_PERCENT = 20;
export const OFFER_WINDOW_HOURS = 48;
/** "Quer cupom?": 1 cupom novo por usuário a cada N dias (decisão do produto: 3 meses). */
export const PERSONAL_COUPON_COOLDOWN_DAYS = 90;

/** Mesmo piso dos cupons: nunca abaixo de R$ 47 (DISCOUNT_FLOOR_CENTS). */
export const OFFER_MIN_FINAL_CENTS = DISCOUNT_FLOOR_CENTS;

export type OfferKind = "welcome" | "personal";
/** avulso = tíquete de 1 evento; pack = pacote/slider/1ª fatura da franquia. */
export type OfferCategory = "avulso" | "pack";

export interface OfferTerms {
  avulsoOffCents: number;
  packPercent: number;
}

/** Desconto da oferta para o preço dado (inteiro, nunca deixa abaixo do piso). */
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
      ? offer.avulsoOffCents
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
export function offerHeadline(kind: OfferKind, terms: OfferTerms): string {
  const label = kind === "welcome" ? "Oferta de boas-vindas" : "Seu cupom pessoal";
  const reais = `R$ ${String(Math.round(terms.avulsoOffCents / 100))}`;
  return `${label}: ${reais} de desconto no evento avulso ou ${String(terms.packPercent)}% nos pacotes de créditos`;
}

/** Texto público (visitante) da boas-vindas — espelha as constantes acima, sem contagem. */
export function welcomeVisitorCopy(): string {
  const reais = (WELCOME_AVULSO_OFF_CENTS / 100).toLocaleString("pt-BR");
  return `Crie sua conta e ganhe R$ ${reais} no evento avulso ou ${WELCOME_PACK_PERCENT}% nos pacotes por ${OFFER_WINDOW_HOURS}h.`;
}

/** Versão curta para faixa no mobile (< sm): cabe numa linha em 390 px. */
export function welcomeVisitorShortCopy(): string {
  const reais = (WELCOME_AVULSO_OFF_CENTS / 100).toLocaleString("pt-BR");
  return `Ganhe R$ ${reais} no 1º evento · ${OFFER_WINDOW_HOURS}h`;
}
