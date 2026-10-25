import "server-only";

import {
  discountCents as couponDiscountCents,
  isCouponRedeemable,
  isCourtesyCoupon,
  normalizeCouponCode,
} from "@/lib/coupons/pure";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { offerDiscountCents, pickBetterDiscount, type OfferCategory } from "./pure";
import { activeUserOffer, claimUserOffer, type UserOfferView } from "./server";

export const COUPON_REFUSAL: Record<string, string> = {
  already_used: "Você já usou este cupom — cada cupom vale uma vez por conta.",
  exhausted: "Cupom esgotado.",
  invalid: "Cupom inválido, expirado ou esgotado.",
  already_active: "Este evento já está ativo — o orçamento está liberado.",
  event_not_found: "Evento não encontrado.",
  courtesy_pack: "Cupom de cortesia vale só para ativar um evento avulso.",
  offer_gone: "Sua oferta expirou ou já foi usada — o preço foi atualizado. Tente de novo.",
};

export type CheckoutDiscount =
  | { kind: "error"; error: string }
  /** Cortesia (só avulso): o caller faz o resgate atômico existente. */
  | { kind: "courtesy"; code: string }
  | {
      kind: "applied";
      source: "coupon" | "offer";
      discountCents: number;
      code: string;
      /** Reserva de cupom (attach_coupon_reservation após gravar o pagamento). */
      reservationId: string | null;
      /** Oferta pessoal resgatada (user_offer_attach após gravar o pagamento). */
      offerId: string | null;
      /** Cupom digitado ignorado porque a oferta era maior (sem acumular). */
      couponIgnored: boolean;
    }
  | { kind: "none" };

/**
 * Desconto do checkout calculado SEMPRE no servidor: cupom digitado vs. oferta
 * pessoal ativa (boas-vindas / "Quer cupom?") ⇒ vale o maior, sem acumular.
 * Efeitos: reserva o cupom ou resgata a oferta (a oferta é devolvida pelo caller
 * se a cobrança falhar).
 */
export async function resolveCheckoutDiscount(input: {
  profileId: string;
  category: OfferCategory;
  priceCents: number;
  couponRaw: string;
  eventId: string | null;
}): Promise<CheckoutDiscount> {
  const admin = getSupabaseAdmin();
  const code = normalizeCouponCode(input.couponRaw);
  const offer: UserOfferView | null = await activeUserOffer(input.profileId);
  const offerCents =
    offer === null ? null : offerDiscountCents(offer, input.category, input.priceCents);

  const applyOffer = async (couponIgnored: boolean): Promise<CheckoutDiscount> => {
    if (offer === null || offerCents === null || offerCents <= 0) return { kind: "none" };
    if (!(await claimUserOffer(input.profileId, offer.id))) {
      return { kind: "error", error: COUPON_REFUSAL.offer_gone ?? "" };
    }
    return {
      kind: "applied",
      source: "offer",
      discountCents: offerCents,
      code: offer.code,
      reservationId: null,
      offerId: offer.id,
      couponIgnored,
    };
  };

  if (code.length === 0) {
    return applyOffer(false);
  }

  const { data: coupon } = await admin.from("coupons").select("*").eq("code", code).maybeSingle();
  if (coupon === null || !isCouponRedeemable(coupon)) {
    return { kind: "error", error: COUPON_REFUSAL.invalid ?? "" };
  }
  if (isCourtesyCoupon(coupon)) {
    return input.category === "avulso"
      ? { kind: "courtesy", code }
      : { kind: "error", error: COUPON_REFUSAL.courtesy_pack ?? "" };
  }

  const couponCents = couponDiscountCents(coupon, input.priceCents);
  if (pickBetterDiscount(couponCents, offerCents) === "offer") {
    return applyOffer(true);
  }

  const { data: reserved, error: reserveError } = await admin.rpc("reserve_coupon", {
    p_code: code,
    p_profile_id: input.profileId,
    p_event_id: input.eventId,
  });
  const reservation = reserved?.[0];
  if (reserveError !== null || reservation === undefined) {
    logger.error({ code: reserveError?.code }, "falha ao reservar cupom");
    return { kind: "error", error: "Não foi possível validar o cupom. Tente novamente." };
  }
  if (reservation.status !== "ok") {
    return {
      kind: "error",
      error: COUPON_REFUSAL[reservation.status] ?? COUPON_REFUSAL.invalid ?? "",
    };
  }
  return {
    kind: "applied",
    source: "coupon",
    discountCents: couponCents,
    code,
    reservationId: reservation.reservation_id,
    offerId: null,
    couponIgnored: false,
  };
}

/** Prévia (sem efeitos) para o botão "Aplicar" — mesma regra do checkout. */
export async function previewCheckoutDiscount(input: {
  profileId: string;
  category: OfferCategory;
  priceCents: number;
  couponRaw: string;
}): Promise<
  | { error: string }
  | {
      ok: true;
      code: string;
      discountCents: number;
      finalCents: number;
      offerWins: boolean;
      courtesy: boolean;
    }
> {
  const admin = getSupabaseAdmin();
  const code = normalizeCouponCode(input.couponRaw);
  if (code.length < 2) return { error: "Digite o código do cupom." };
  const { data: coupon } = await admin.from("coupons").select("*").eq("code", code).maybeSingle();
  if (coupon === null || !isCouponRedeemable(coupon)) {
    return { error: COUPON_REFUSAL.invalid ?? "" };
  }
  const { data: used } = await admin
    .from("coupon_redemptions")
    .select("id")
    .eq("coupon_id", coupon.id)
    .eq("profile_id", input.profileId)
    .eq("status", "redeemed")
    .maybeSingle();
  if (used !== null) return { error: COUPON_REFUSAL.already_used ?? "" };
  if (isCourtesyCoupon(coupon)) {
    if (input.category !== "avulso") return { error: COUPON_REFUSAL.courtesy_pack ?? "" };
    return {
      ok: true,
      code,
      discountCents: input.priceCents,
      finalCents: 0,
      offerWins: false,
      courtesy: true,
    };
  }
  const couponCents = couponDiscountCents(coupon, input.priceCents);
  const offer = await activeUserOffer(input.profileId);
  const offerCents =
    offer === null ? null : offerDiscountCents(offer, input.category, input.priceCents);
  const offerWins = pickBetterDiscount(couponCents, offerCents) === "offer";
  const best = offerWins ? (offerCents ?? 0) : couponCents;
  return {
    ok: true,
    code,
    discountCents: best,
    finalCents: input.priceCents - best,
    offerWins,
    courtesy: false,
  };
}
