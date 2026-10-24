import { describe, expect, it } from "vitest";

import {
  clientIpFrom,
  detectSource,
  formatCountdown,
  hashIdentifier,
  isWelcomeCode,
  summarizeWelcomeOffers,
  welcomeDiscountCents,
  WELCOME_FINAL_PRICE_CENTS,
} from "@/lib/welcome/pure";

const SALT = "salt-de-teste-com-16+";

describe("oferta de boas-vindas — regras puras", () => {
  it("leva o tíquete de R$ 97 a R$ 47", () => {
    expect(WELCOME_FINAL_PRICE_CENTS).toBe(4700);
    expect(welcomeDiscountCents(9700)).toBe(5000);
    expect(welcomeDiscountCents(4000)).toBe(0);
    expect(() => welcomeDiscountCents(97.5)).toThrow();
  });

  it("detecta a origem: convite > promo (utm/ref) > novo IP", () => {
    expect(detectSource({ convite: "abc", utm_source: "ig" })).toBe("convite");
    expect(detectSource({ utm_campaign: "natal" })).toBe("promo");
    expect(detectSource({ ref: "parceiro" })).toBe("promo");
    expect(detectSource({ utm_source: "  " })).toBe("new_ip");
    expect(detectSource({})).toBe("new_ip");
  });

  it("hash de IP é HMAC com salt: determinístico, 64 hex, sem o IP bruto", () => {
    const a = hashIdentifier("ip", "203.0.113.7", SALT);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(hashIdentifier("ip", "203.0.113.7", SALT));
    expect(a).not.toContain("203");
    expect(a).not.toBe(hashIdentifier("device", "203.0.113.7", SALT));
    expect(a).not.toBe(hashIdentifier("ip", "203.0.113.7", `${SALT}x`));
    expect(() => hashIdentifier("ip", "1.1.1.1", "curto")).toThrow();
  });

  it("extrai o IP do primeiro X-Forwarded-For", () => {
    const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
    expect(clientIpFrom(h({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIpFrom(h({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIpFrom(h({}))).toBe("unknown");
  });

  it("formata a contagem hh:mm:ss e nunca negativa", () => {
    expect(formatCountdown(86_400_000)).toBe("24:00:00");
    expect(formatCountdown(3_661_999)).toBe("01:01:01");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });

  it("reconhece códigos de boas-vindas", () => {
    expect(isWelcomeCode("BEMVINDO-AB12CD34")).toBe(true);
    expect(isWelcomeCode("BEMVINDA10")).toBe(false);
    expect(isWelcomeCode(null)).toBe(false);
  });

  it("resume uso para o admin", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    const s = summarizeWelcomeOffers(
      [
        { source: "promo", created_at: "2026-10-24T00:00:00Z", expires_at: "2026-10-25T00:00:00Z", profile_id: "p1", redeemed_at: null },
        { source: "new_ip", created_at: "2026-10-22T00:00:00Z", expires_at: "2026-10-23T00:00:00Z", profile_id: null, redeemed_at: null },
        { source: "convite", created_at: "2026-10-24T01:00:00Z", expires_at: "2026-10-25T01:00:00Z", profile_id: "p2", redeemed_at: "2026-10-24T02:00:00Z" },
        { source: "promo", created_at: "2026-10-24T01:00:00Z", expires_at: "2026-10-25T01:00:00Z", profile_id: null, redeemed_at: null },
      ],
      now,
    );
    expect(s).toMatchObject({ issued: 4, active: 2, expired: 1, bound: 2, redeemed: 1, conversionBps: 2500 });
    expect(s.bySource).toEqual({ new_ip: 1, convite: 1, promo: 2 });
    expect(summarizeWelcomeOffers([], now).conversionBps).toBe(0);
  });
});
