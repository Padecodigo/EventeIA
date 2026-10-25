import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { passwordSavedMessage, resolveHasPassword } from "@/lib/auth/password";
import { welcomeVisitorCopy } from "@/lib/offers/pure";

describe("welcomeVisitorCopy", () => {
  it("matches the real offer (R$ 40 avulso / 30% pacotes / 48h)", () => {
    expect(welcomeVisitorCopy()).toBe(
      "Crie sua conta e ganhe R$ 40 no evento avulso ou 30% nos pacotes por 48h.",
    );
  });
  it("public offer UI has no R$ 47 offer nor a visitor countdown", () => {
    const tsx = readFileSync("components/marketing/welcome-offer.tsx", "utf8");
    const js = readFileSync("public/welcome-offer.js", "utf8");
    expect(tsx).not.toMatch(/WELCOME_FINAL_PRICE_CENTS|data-welcome-countdown|ev-welcome-modal/);
    expect(js).not.toMatch(/data-welcome-countdown/);
  });
  it("checkout no longer applies the legacy R$ 47 visitor offer", () => {
    const src = readFileSync("app/(dashboard)/eventos/actions.ts", "utf8");
    expect(src).not.toMatch(/reserveWelcomeOffer|welcomeDiscountCents/);
  });
});

describe("resolveHasPassword", () => {
  const magicLink = { identities: [{ provider: "email" }] };
  it("magic-link-only account (email identity, no password in DB) -> Criar senha", () => {
    expect(resolveHasPassword(false, magicLink)).toBe(false);
  });
  it("DB says password set -> Alterar senha", () => {
    expect(resolveHasPassword(true, { identities: [{ provider: "google" }] })).toBe(true);
  });
  it("has_password flag wins; DB failure falls back to heuristic", () => {
    expect(resolveHasPassword(false, { app_metadata: { has_password: true } })).toBe(true);
    expect(resolveHasPassword(null, magicLink)).toBe(true);
  });
});

describe("passwordSavedMessage", () => {
  it("mentions Google only for Google users", () => {
    expect(passwordSavedMessage({ identities: [{ provider: "email" }] })).not.toMatch(/Google/);
    expect(passwordSavedMessage({ identities: [{ provider: "google" }] })).toMatch(/Google/);
  });
});

describe("CSP", () => {
  it("allows Cloudflare Web Analytics beacon", () => {
    const cfg = readFileSync("next.config.mjs", "utf8");
    expect(cfg).toContain("https://static.cloudflareinsights.com");
    expect(cfg).toContain("https://cloudflareinsights.com");
  });
});
