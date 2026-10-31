import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Checagens de conteúdo da landing (fonte estática; sem renderizar). */
// A colagem do hero vive em components/marketing/hero-mosaic.tsx (renderizada pela landing).
const source =
  readFileSync(join(process.cwd(), "components/marketing/hero-mosaic.tsx"), "utf8") +
  readFileSync(join(process.cwd(), "app/(marketing)/page.tsx"), "utf8");
const testimonials = readFileSync(join(process.cwd(), "components/marketing/testimonials.tsx"), "utf8");

function mosaicSources(): string[] {
  const block = source.slice(source.indexOf("const MOSAIC"), source.indexOf("] as const;"));
  return [...block.matchAll(/src: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("landing — proposta inequívoca (beta 31/10: confundiram com B2B entre fornecedores)", () => {
  const page = readFileSync(join(process.cwd(), "app/(marketing)/page.tsx"), "utf8");
  const hero = page.slice(page.indexOf("HERO (acima da dobra)"), page.indexOf("Selos de confiança"));
  it("headline fala com quem organiza: encontra fornecedores, compara preços, orçamento pronto", () => {
    const h1 = page.slice(page.indexOf("<h1"), page.indexOf("</h1>"));
    for (const t of ["Você conta como é seu evento.", "encontra os fornecedores", "compara os preços", "orçamento pronto"]) expect(h1).toContain(t);
    expect(hero).toContain("Para quem está organizando um evento");
    for (const t of ["Casamento", "aniversário", "corporativo"]) expect(hero).toContain(t);
  });
  it("primeira seção após o hero é o 'como funciona' do cliente em 3 passos", () => {
    const afterHero = page.slice(page.indexOf("</section>", page.indexOf("HERO (acima da dobra)")));
    expect(afterHero.indexOf('id="como-funciona"')).toBeLessThan(afterHero.indexOf("Selos de confiança"));
    const steps = page.slice(page.indexOf("const STEPS"), page.indexOf("] as const;", page.indexOf("const STEPS")));
    expect([...steps.matchAll(/title: "([^"]+)"/g)].map((m) => m[1])).toEqual(["Conte seu evento", "A EventeIA busca e compara", "Você recebe e escolhe"]);
    expect(page).toContain("não é uma rede entre fornecedores");
  });
  it("link para fornecedores existe, separado e discreto (não é CTA)", () => {
    const line = hero.slice(hero.indexOf("É fornecedor de eventos?") - 80, hero.indexOf('data-testid="link-fornecedor"') + 200);
    expect(line).toContain('href="/seja-fornecedor"');
    expect(line).toContain("text-xs");
    expect(line).not.toMatch(/bg-primaria|rounded-full/);
  });
  it("meta description, título e OG explicam o serviço para quem organiza", () => {
    const site = readFileSync(join(process.cwd(), "lib/seo/site.ts"), "utf8");
    const og = readFileSync(join(process.cwd(), "app/og/route.tsx"), "utf8");
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(site).toMatch(/Vai organizar um casamento.*encontra os fornecedores, compara os preços e entrega o orçamento pronto/);
    expect(og).toContain("A gente encontra os fornecedores, compara os preços e entrega o orçamento pronto.");
    expect(layout).toContain("Fornecedores encontrados, preços comparados, orçamento pronto");
  });
});

describe("landing — hero", () => {
  it("festa infantil abre o mosaico, mas há vários tipos de evento", () => {
    const srcs = mosaicSources();
    expect(srcs[0]).toBe("/img/eventos/festa-infantil-velas.jpg");
    expect(srcs.length).toBeGreaterThanOrEqual(5);
    expect(srcs).toEqual(expect.arrayContaining(["/img/eventos/casamento.jpg", "/img/eventos/festa-formatura-baile.jpg", "/img/eventos/15-anos.jpg", "/festa-infantil.jpg"]));
    for (const src of srcs) expect(src.startsWith("/eventos/")).toBe(false);
    expect(source).toContain("priority={index === 0}");
  });

  it("mosaico inclui card Corporativo (WebP licenciado, alt em PT) — 6 tipos", () => {
    const srcs = mosaicSources();
    expect(srcs).toHaveLength(6);
    expect(srcs).toContain("/img/eventos/corporativo.webp");
    const block = source.slice(source.indexOf("const MOSAIC"), source.indexOf("] as const;"));
    expect(block).toMatch(/label: "Corporativo"/);
    expect(block).toMatch(/alt: "Plateia lotada em um auditório durante um evento corporativo"/);
    const credits = readFileSync(join(process.cwd(), "public/img/eventos/CREDITOS.md"), "utf8");
    expect(credits).toContain("corporativo.webp");
    for (const src of srcs) expect(readFileSync(join(process.cwd(), "public", src)).length).toBeLessThan(220_000);
  });

  it("proposta de valor clara: redes sociais + 3 opções (preço, custo-benefício, comodidade)", () => {
    const h1End = source.indexOf("</h1>");
    const hero = source.slice(source.indexOf("<h1"), source.indexOf("</p>", h1End));
    expect(hero).toMatch(/redes sociais/);
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

describe("landing — animação 'como funciona' (leve, sem JS)", () => {
  const comp = readFileSync(join(process.cwd(), "components/marketing/how-it-works-animation.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const page = readFileSync(join(process.cwd(), "app/(marketing)/page.tsx"), "utf8");
  it("é um server component SVG, sem libs nem assets externos", () => {
    expect(comp).not.toMatch(/"use client"|useEffect|framer|lottie|<img|src=|https?:\/\//);
    expect(comp).toContain("<svg");
    expect(comp).toContain("<title");
    expect(page).toContain("<HowItWorksAnimation />");
  });
  it("3 cenas em loop de 9 s e fallback estático com prefers-reduced-motion", () => {
    for (const c of ["ev-how-s1", "ev-how-s2", "ev-how-s3"]) expect(comp).toContain(c);
    expect(css).toMatch(/\.ev-how-scene \{[^}]*9s/);
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("animation: none");
    expect(reduced).toMatch(/\.ev-how-s3 \{ opacity: 1; \}/);
  });
});

describe("hero mobile-first", () => {
  it("encurta o subtítulo no celular para o CTA ficar acima da dobra", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/(marketing)/page.tsx", "utf8");
    expect(src).toContain('<span className="hidden sm:inline">: em vez de você ligar');
    expect(src).toContain("mt-6 flex flex-col gap-3 sm:mt-8");
  });
});
