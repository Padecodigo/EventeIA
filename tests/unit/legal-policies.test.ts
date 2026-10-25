import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal/content";
import { REFUND_SECTIONS, RETENTION_SECTIONS } from "@/lib/legal/policies";
import { PUBLIC_ROUTES } from "@/lib/seo/site";

describe("políticas de estorno e retenção", () => {
  it("estão no sitemap", () => {
    const paths = PUBLIC_ROUTES.map((r) => r.path);
    expect(paths).toContain("/estorno");
    expect(paths).toContain("/retencao-de-dados");
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/estorno"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/retencao-de-dados"))).toBe(true);
  });

  it("estorno cobre arrependimento, busca iniciada, prazos e disputas", () => {
    const t = JSON.stringify(REFUND_SECTIONS);
    for (const w of [
      "7 dias",
      "art. 49",
      "não é reembolsável",
      "Pix",
      "Cartão",
      "Asaas",
      "chargeback",
      "MED",
      "suspensos",
      "Essencial",
      "Atelier",
      "Maison",
      "R$ 97",
      "R$ 57",
      "/chamados",
      "/contato",
    ]) {
      expect(t).toContain(w);
    }
  });

  it("retenção cobre 90 dias, 5 anos, conta ativa, direitos e LGPD", () => {
    const t = JSON.stringify(RETENTION_SECTIONS);
    for (const w of [
      "90 dias",
      "anonimizados",
      "5 anos",
      "enquanto a conta estiver ativa",
      "Lei 13.709/2018",
      "Correção",
      "Eliminação antecipada",
      "/contato",
    ]) {
      expect(t).toContain(w);
    }
  });

  it("Termos e Privacidade apontam para as novas políticas sem conflito", () => {
    const terms = JSON.stringify(TERMS_SECTIONS);
    expect(terms).toContain("/estorno");
    expect(terms).not.toContain("reembolso dos créditos ainda não usados");
    const priv = JSON.stringify(PRIVACY_SECTIONS);
    expect(priv).toContain("/retencao-de-dados");
    expect(priv).toContain("90 dias");
    expect(priv).toContain("5 anos");
  });
});
