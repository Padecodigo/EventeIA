import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Checagens de conteúdo da landing (fonte estática; sem renderizar). */
const source = readFileSync(join(process.cwd(), "app/(marketing)/page.tsx"), "utf8");
const testimonials = readFileSync(join(process.cwd(), "components/marketing/testimonials.tsx"), "utf8");

function mosaicSources(): string[] {
  const block = source.slice(source.indexOf("const MOSAIC"), source.indexOf("] as const;"));
  return [...block.matchAll(/src: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("landing — hero", () => {
  it("festa infantil abre o mosaico, mas há vários tipos de evento", () => {
    const srcs = mosaicSources();
    expect(srcs[0]).toBe("/img/eventos/festa-infantil-velas.jpg");
    expect(srcs.length).toBeGreaterThanOrEqual(5);
    expect(srcs).toEqual(expect.arrayContaining(["/img/eventos/casamento.jpg", "/img/eventos/formatura-familia.jpg", "/img/eventos/15-anos.jpg", "/festa-infantil.jpg"]));
    for (const src of srcs) expect(src.startsWith("/eventos/")).toBe(false);
    expect(source).toContain("priority={index === 0}");
  });

  it("proposta de valor clara: WhatsApp + 3 opções (preço, custo-benefício, comodidade)", () => {
    const h1End = source.indexOf("</h1>");
    const hero = source.slice(source.indexOf("<h1"), source.indexOf("</p>", h1End));
    expect(hero).toMatch(/WhatsApp/);
    expect(hero).toMatch(/3 opções/);
    expect(hero).not.toMatch(/\bIA\b|fila/);
    for (const word of ["preço", "custo-benefício", "comodidade"]) expect(hero).toContain(word);
  });

  it("CTA principal e planos (ticket avulso) visíveis", () => {
    expect(source).toContain("Começar agora");
    expect(source).toContain('href="#planos"');
    expect(source).toContain('id="planos"');
    expect(source).toContain("Ticket avulso");
    expect(source).toContain("PLANS.map");
  });

  it("não é focada só em festa infantil", () => {
    for (const type of ["Aniversário", "15 anos", "Formatura", "Casamento", "Corporativo"]) {
      expect(source).toContain(type);
    }
  });
});

describe("landing — sem nome do gateway", () => {
  it("não cita 'via Asaas' nem o gateway nos textos da landing", () => {
    expect(source).not.toMatch(/Asaas/);
  });
});

describe("landing — v2 visual", () => {
  it("usa 'Corporativo' (nunca 'Empresa') no texto da landing", () => {
    expect(source).not.toMatch(/\bEmpresa\b/);
    expect(source).toContain("evento corporativo");
  });
  it("fotos têm hover dinâmico e respeitam prefers-reduced-motion", () => {
    expect(source).toContain("group-hover:scale-110");
    expect(source).toContain("hover:rotate-0");
    expect(source).toContain("hover:z-50");
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*ev-photo/);
  });
});

describe("landing — depoimentos de exemplo", () => {
  it("fallback é marcado como exemplo e não traz números inventados", () => {
    expect(testimonials).toMatch(/CONTEÚDO DE EXEMPLO/);
    expect(testimonials).not.toContain("Exemplos ilustrativos");
    expect(source).not.toContain("Exemplos ilustrativos");
    expect(testimonials).not.toMatch(/outcome: "[^"]*\d/);
  });
  it("cidades da região do Vale do Paraíba", () => {
    for (const city of ["São José dos Campos", "Taubaté", "Jacareí"]) expect(testimonials).toContain(city);
  });
});
