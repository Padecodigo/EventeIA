import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal/content";
import {
  TERMS_FIELD,
  TERMS_VERSION,
  hasAcceptedTerms,
  isCurrentTermsCookie,
} from "@/lib/legal/terms";
import { PUBLIC_ROUTES } from "@/lib/seo/site";

function fd(value?: string): FormData {
  const f = new FormData();
  if (value !== undefined) f.set(TERMS_FIELD, value);
  return f;
}

describe("aceite dos termos", () => {
  it("só aceita a checkbox marcada", () => {
    expect(hasAcceptedTerms(fd("on"))).toBe(true);
    expect(hasAcceptedTerms(fd())).toBe(false);
    expect(hasAcceptedTerms(fd(""))).toBe(false);
    expect(hasAcceptedTerms(fd("off"))).toBe(false);
    expect(hasAcceptedTerms(undefined)).toBe(false);
  });

  it("versão vigente é a data de vigência e o cookie só vale para ela", () => {
    expect(TERMS_VERSION).toBe("2026-10-25");
    expect(isCurrentTermsCookie("2026-10-25")).toBe(true);
    expect(isCurrentTermsCookie("2020-01-01")).toBe(false);
    expect(isCurrentTermsCookie(undefined)).toBe(false);
  });
});

describe("páginas legais", () => {
  it("/termos e /privacidade estão no sitemap", () => {
    const paths = PUBLIC_ROUTES.map((r) => r.path);
    expect(paths).toContain("/termos");
    expect(paths).toContain("/privacidade");
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/termos"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/privacidade"))).toBe(true);
  });

  it("política cita os terceiros, bases legais e o contato", () => {
    const text = JSON.stringify(PRIVACY_SECTIONS);
    for (const word of [
      "Asaas",
      "OpenStreetMap",
      "Serper",
      "Google Places",
      "DeepSeek",
      "Resend",
      "WhatsApp",
      "Supabase",
      "art. 18",
      "Execução de contrato",
      "Legítimo interesse",
      "Consentimento",
      "Obrigação legal",
      "/contato",
      "25/10/2026",
      "não guarda o número do seu cartão",
    ]) {
      expect(text).toContain(word);
    }
    expect(text).not.toMatch(/CNPJ|@eventeia/);
  });

  it("termos: intermediação, reembolso de 7 dias e foro", () => {
    const text = JSON.stringify(TERMS_SECTIONS);
    expect(text).toContain("não é parte do contrato");
    expect(text).toContain("7 dias");
    expect(text).toContain("foro");
    expect(text).toContain("não vencem");
  });
});
