import "server-only";

import { headers } from "next/headers";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clientIpFrom, hashIdentifier } from "@/lib/welcome/pure";
import { deviceId, welcomeSalt } from "@/lib/welcome/server";

import {
  drawLuckyPercent,
  isValidLuckyPercent,
  LUCKY_REDRAW_WINDOW_HOURS,
  LUCKY_VALIDITY_HOURS,
  type LuckyStatus,
} from "./pure";

export interface LuckyCouponView {
  status: LuckyStatus;
  code: string | null;
  percent: number | null;
  /** ms restantes pelo relógio do BANCO. */
  remainingMs: number;
  /** ms até poder sortear de novo (0 = já pode / nunca sorteou). */
  redrawInMs: number;
  created: boolean;
}

const UNAVAILABLE: LuckyCouponView = {
  status: "unavailable",
  code: null,
  percent: null,
  remainingMs: 0,
  redrawInMs: 0,
  created: false,
};

export class LuckyRateLimitedError extends Error {}

/**
 * Consulta (`draw: false`) ou sorteia (`draw: true`) o cupom do visitante. O percentual é
 * sorteado AQUI (crypto.randomInt) e o banco só o grava fora da janela de 48h — dentro dela,
 * repetir devolve o mesmo cupom. Falha fechada ⇒ "unavailable".
 */
export async function lookupLuckyCoupon(options: {
  draw: boolean;
  profileId: string | null;
}): Promise<LuckyCouponView> {
  const s = welcomeSalt();
  if (s === null) {
    return UNAVAILABLE;
  }
  const device =
    (await deviceId(false)) ?? (options.profileId !== null ? `account:${options.profileId}` : null);
  if (device === null) {
    return { ...UNAVAILABLE, status: "ineligible" };
  }
  const ip = clientIpFrom(await headers());
  try {
    const { data, error } = await getSupabaseAdmin().rpc("lucky_coupon_lookup", {
      p_ip_hash: hashIdentifier("ip", ip, s),
      p_device_hash: hashIdentifier("device", device, s),
      p_profile_id: options.profileId,
      p_percent: options.draw ? drawLuckyPercent() : null,
      p_window_hours: LUCKY_REDRAW_WINDOW_HOURS,
      p_validity_hours: Math.min(LUCKY_VALIDITY_HOURS, LUCKY_REDRAW_WINDOW_HOURS),
    });
    if (error !== null) {
      if (error.message.includes("rate_limited")) {
        throw new LuckyRateLimitedError();
      }
      logger.warn({ code: error.code }, "lucky_coupon_lookup falhou");
      return UNAVAILABLE;
    }
    const row = Array.isArray(data) ? data[0] : undefined;
    if (row === undefined) {
      return UNAVAILABLE;
    }
    const remainingMs =
      row.status === "active" && row.expires_at !== null
        ? Math.max(0, Date.parse(row.expires_at) - Date.parse(row.server_now))
        : 0;
    return {
      status: row.status,
      code: row.status === "active" ? row.code : null,
      percent: isValidLuckyPercent(row.percent) ? row.percent : null,
      remainingMs,
      redrawInMs:
        row.redraw_at !== null
          ? Math.max(0, Date.parse(row.redraw_at) - Date.parse(row.server_now))
          : 0,
      created: row.created,
    };
  } catch (caught) {
    if (caught instanceof LuckyRateLimitedError) {
      throw caught;
    }
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "cupom sorteado indisponível",
    );
    return UNAVAILABLE;
  }
}

/** Checkout: reserva para UM evento; o percentual retornado é o GRAVADO no banco. */
export async function reserveLuckyCoupon(
  profileId: string,
  eventId: string,
): Promise<{ code: string; percent: number; expiresAt: string } | null> {
  const { data, error } = await getSupabaseAdmin().rpc("lucky_coupon_reserve", {
    p_profile_id: profileId,
    p_event_id: eventId,
  });
  const row = Array.isArray(data) ? data[0] : undefined;
  if (error !== null || row === undefined || !isValidLuckyPercent(row.percent)) {
    return null;
  }
  return { code: row.code, percent: row.percent, expiresAt: row.expires_at };
}
