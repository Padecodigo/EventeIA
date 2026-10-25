import "server-only";

import { randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import {
  clientIpFrom,
  DEVICE_COOKIE,
  hashIdentifier,
  VISIT_COOKIE,
  type WelcomeSource,
  type WelcomeStatus,
} from "./pure";

export interface WelcomeOfferView {
  status: WelcomeStatus;
  code: string | null;
  /** ms restantes calculados com o relógio do BANCO (nunca do client). */
  remainingMs: number;
  created: boolean;
}

const UNAVAILABLE: WelcomeOfferView = {
  status: "unavailable",
  code: null,
  remainingMs: 0,
  created: false,
};

export class WelcomeRateLimitedError extends Error {}

export function welcomeSalt(): string | null {
  const value = process.env.WELCOME_HASH_SALT;
  return value !== undefined && value.length >= 16 ? value : null;
}

/** Lê (ou cria, se `allowSet`) o id de aparelho em cookie HttpOnly. */
export async function deviceId(allowSet: boolean): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing !== undefined && /^[A-Za-z0-9_-]{20,64}$/.test(existing)) {
    return existing;
  }
  if (!allowSet) {
    return null;
  }
  const created = randomBytes(24).toString("base64url");
  jar.set(DEVICE_COOKIE, created, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return created;
}

/** Cookie de VISITA (sessão do navegador, sem maxAge): some ao fechar o navegador. */
export async function visitId(allowSet: boolean): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(VISIT_COOKIE)?.value;
  if (existing !== undefined && /^[A-Za-z0-9_-]{20,64}$/.test(existing)) {
    return existing;
  }
  if (!allowSet) {
    return null;
  }
  const created = randomBytes(18).toString("base64url");
  jar.set(VISIT_COOKIE, created, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return created;
}

async function touchVisit(
  deviceHash: string,
  profileId: string | null,
  visitHash: string | null,
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("welcome_offer_touch_visit", {
    p_device_hash: deviceHash,
    p_profile_id: profileId,
    p_visit_hash: visitHash,
  });
  if (error !== null) {
    logger.warn({ code: error.code }, "welcome_offer_touch_visit falhou");
  }
}

/**
 * Consulta/emite a oferta do visitante atual. Falha fechada: sem salt ou banco ⇒ "unavailable".
 * `claim` só deve ser true em rota POST (cookie de aparelho pode ser criado).
 */
export async function lookupWelcomeOffer(options: {
  claim: boolean;
  source: WelcomeSource;
  profileId: string | null;
}): Promise<WelcomeOfferView> {
  const s = welcomeSalt();
  if (s === null) {
    return UNAVAILABLE;
  }
  // Sem cookie de aparelho (ex.: outro navegador já logado): busca só pela conta.
  const device =
    (await deviceId(options.claim)) ??
    (options.profileId !== null ? `account:${options.profileId}` : null);
  if (device === null) {
    return { ...UNAVAILABLE, status: "none" };
  }
  const ip = clientIpFrom(await headers());
  const deviceHash = hashIdentifier("device", device, s);

  try {
    // Visita: a oferta só vale na visita em que foi emitida. Visita nova ⇒ perdida (no banco).
    const existingVisit = await visitId(false);
    await touchVisit(
      deviceHash,
      options.profileId,
      existingVisit === null ? null : hashIdentifier("device", `visit:${existingVisit}`, s),
    );
    const visit = existingVisit ?? (options.claim ? await visitId(true) : null);

    const { data, error } = await getSupabaseAdmin().rpc("welcome_offer_lookup", {
      p_ip_hash: hashIdentifier("ip", ip, s),
      p_device_hash: deviceHash,
      p_profile_id: options.profileId,
      p_source: options.source,
      p_claim: options.claim,
    });
    if (error !== null) {
      if (error.message.includes("rate_limited")) {
        throw new WelcomeRateLimitedError();
      }
      logger.warn({ code: error.code }, "welcome_offer_lookup falhou");
      return UNAVAILABLE;
    }
    const row = Array.isArray(data) ? data[0] : undefined;
    if (row === undefined) {
      return UNAVAILABLE;
    }
    if (row.created && visit !== null) {
      await touchVisit(
        deviceHash,
        options.profileId,
        hashIdentifier("device", `visit:${visit}`, s),
      );
    }
    const remainingMs =
      row.expires_at !== null
        ? Math.max(0, Date.parse(row.expires_at) - Date.parse(row.server_now))
        : 0;
    return { status: row.status, code: row.code, remainingMs, created: row.created };
  } catch (caught) {
    if (caught instanceof WelcomeRateLimitedError) {
      throw caught;
    }
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "oferta indisponível",
    );
    return UNAVAILABLE;
  }
}

/**
 * Vincula a oferta deste aparelho à conta (cadastro por e-mail, callback do Google OAuth,
 * primeiro acesso autenticado). Nunca lança: o vínculo não pode quebrar o login.
 */
export async function bindWelcomeOfferToUser(profileId: string): Promise<void> {
  try {
    if ((await deviceId(false)) === null) {
      return; // sem aparelho com oferta: nada a vincular (evita RPC a cada página)
    }
    await lookupWelcomeOffer({ claim: false, source: "new_ip", profileId });
  } catch {
    // rate limit/indisponível: tenta de novo no próximo acesso
  }
}

/** Prova social com dado real (0 quando indisponível — e aí não é exibida). */
export async function recentWelcomeRedemptions(): Promise<number> {
  try {
    const { data } = await getSupabaseAdmin().rpc("welcome_offer_recent_redemptions");
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}
