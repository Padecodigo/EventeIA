import { createHmac } from "node:crypto";

/**
 * Oferta de boas-vindas (novo visitante) — regras puras.
 * Preço final fixo do tíquete único com a oferta; o desconto é calculado no servidor.
 */
export const WELCOME_FINAL_PRICE_CENTS = 4700;
export const WELCOME_CODE_PREFIX = "BEMVINDO-";
export const DEVICE_COOKIE = "ev_vid";

export type WelcomeSource = "new_ip" | "convite" | "promo";
export type WelcomeStatus = "active" | "expired" | "redeemed" | "ineligible" | "none" | "unavailable";

/** Origem da visita: convite (?convite=), promo/anúncio (utm_source, utm_campaign, ?ref=) ou novo IP. */
export function detectSource(params: Record<string, unknown>): WelcomeSource {
  const has = (key: string): boolean => {
    const value = params[key];
    return typeof value === "string" && value.trim().length > 0;
  };
  if (has("convite")) {
    return "convite";
  }
  if (has("utm_source") || has("utm_campaign") || has("ref")) {
    return "promo";
  }
  return "new_ip";
}

/** HMAC-SHA256 hex com salt do servidor (LGPD: o IP bruto nunca é gravado). */
export function hashIdentifier(kind: "ip" | "device", value: string, salt: string): string {
  if (salt.length < 16) {
    throw new Error("salt muito curto");
  }
  return createHmac("sha256", salt).update(`${kind}:${value}`).digest("hex");
}

/** Primeiro IP do X-Forwarded-For (proxy confiável) ou X-Real-IP. */
export function clientIpFrom(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return headers.get("x-real-ip")?.trim() ?? "unknown";
}

/** Desconto para levar o tíquete a R$ 47 (nunca negativo). */
export function welcomeDiscountCents(priceCents: number): number {
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new Error("priceCents deve ser inteiro positivo");
  }
  return Math.max(0, priceCents - WELCOME_FINAL_PRICE_CENTS);
}

export { formatCountdown } from "./format";

export function isWelcomeCode(code: string | null | undefined): boolean {
  return typeof code === "string" && code.startsWith(WELCOME_CODE_PREFIX);
}

export interface WelcomeOfferRow {
  source: WelcomeSource;
  created_at: string;
  expires_at: string;
  profile_id: string | null;
  redeemed_at: string | null;
}

export interface WelcomeSummary {
  issued: number;
  active: number;
  expired: number;
  bound: number;
  redeemed: number;
  /** redeemed / issued em pontos-base (0..10000). */
  conversionBps: number;
  bySource: Record<WelcomeSource, number>;
}

/** Resumo para /admin/cupons e financeiro. `now` explícito (determinístico em teste). */
export function summarizeWelcomeOffers(rows: WelcomeOfferRow[], now: Date): WelcomeSummary {
  const t = now.getTime();
  const summary: WelcomeSummary = {
    issued: rows.length,
    active: 0,
    expired: 0,
    bound: 0,
    redeemed: 0,
    conversionBps: 0,
    bySource: { new_ip: 0, convite: 0, promo: 0 },
  };
  for (const row of rows) {
    summary.bySource[row.source] += 1;
    if (row.profile_id !== null) {
      summary.bound += 1;
    }
    if (row.redeemed_at !== null) {
      summary.redeemed += 1;
    } else if (Date.parse(row.expires_at) > t) {
      summary.active += 1;
    } else {
      summary.expired += 1;
    }
  }
  summary.conversionBps = rows.length === 0 ? 0 : Math.round((summary.redeemed * 10000) / rows.length);
  return summary;
}
