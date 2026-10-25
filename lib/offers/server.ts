import "server-only";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { PERSONAL_COUPON_COOLDOWN_DAYS, type OfferKind } from "./pure";

/** Oferta pessoal vista pelo app — prazo SEMPRE calculado com o relógio do banco. */
export interface UserOfferView {
  id: string;
  kind: OfferKind;
  code: string;
  avulsoOffCents: number;
  packPercent: number;
  status: "active" | "used" | "expired";
  remainingMs: number;
}

/** 1º acesso logado: inicia a boas-vindas (idempotente). Nunca lança. */
export async function startWelcomeOffer(profileId: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().rpc("user_offer_start_welcome", {
      p_profile_id: profileId,
    });
    if (error !== null) {
      logger.warn({ code: error.code }, "user_offer_start_welcome falhou");
    }
  } catch {
    // não pode quebrar o painel
  }
}

/** Oferta mais recente do usuário (ou null). Nunca lança. */
async function currentUserOffer(profileId: string): Promise<UserOfferView | null> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc("user_offer_current", {
      p_profile_id: profileId,
    });
    const row = Array.isArray(data) ? data[0] : undefined;
    if (error !== null || row === undefined) {
      return null;
    }
    return {
      id: row.id,
      kind: row.kind,
      code: row.code,
      avulsoOffCents: row.avulso_off_cents,
      packPercent: row.pack_percent,
      status: row.status,
      remainingMs: Math.max(0, Date.parse(row.expires_at) - Date.parse(row.server_now)),
    };
  } catch {
    return null;
  }
}

/** Oferta ativa (no prazo e não usada) ou null. */
export async function activeUserOffer(profileId: string): Promise<UserOfferView | null> {
  const offer = await currentUserOffer(profileId);
  return offer !== null && offer.status === "active" && offer.remainingMs > 0 ? offer : null;
}

export type RequestOfferResult =
  | { status: "active" | "created"; offer: UserOfferView }
  | { status: "cooldown"; nextAt: string }
  | { status: "error" };

/** "Quer cupom?" — emite/devolve a oferta no servidor, respeitando o intervalo. */
export async function requestUserOffer(profileId: string): Promise<RequestOfferResult> {
  const { data, error } = await getSupabaseAdmin().rpc("user_offer_request", {
    p_profile_id: profileId,
    p_cooldown_days: PERSONAL_COUPON_COOLDOWN_DAYS,
  });
  const row = Array.isArray(data) ? data[0] : undefined;
  if (error !== null || row === undefined) {
    return { status: "error" };
  }
  if (row.status === "cooldown") {
    return { status: "cooldown", nextAt: row.next_at ?? "" };
  }
  const offer = await activeUserOffer(profileId);
  return offer === null ? { status: "error" } : { status: row.status, offer };
}

/** Resgate atômico (prazo com now() do banco). false ⇒ expirou/já usada. */
export async function claimUserOffer(profileId: string, offerId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("user_offer_claim", {
    p_profile_id: profileId,
    p_offer_id: offerId,
  });
  return error === null && data === true;
}

export async function attachUserOffer(offerId: string, paymentId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("user_offer_attach", {
    p_offer_id: offerId,
    p_payment_id: paymentId,
  });
  if (error !== null) {
    logger.warn({ code: error.code }, "falha ao vincular oferta ao pagamento");
  }
}

/** Devolve a oferta quando a cobrança não chegou a ser criada. Nunca lança. */
export async function releaseUserOffer(offerId: string): Promise<void> {
  try {
    await getSupabaseAdmin().rpc("user_offer_release", { p_offer_id: offerId });
  } catch {
    // a liberação automática (15 min sem pagamento) cobre
  }
}
