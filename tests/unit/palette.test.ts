import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PALETTE, contrastRatio } from "@/lib/design/palette";
import config from "@/tailwind.config";

const LEGACY_HEXES = [
  "A3485A",
  "86374A",
  "3B2420",
  "E8A587",
  "F6E1D8",
  "FBF6F2",
  "F3E6DD",
  "C9734F",
] as const;

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mdx"]);

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      collectFiles(full, out);
    } else if (TEXT_EXTENSIONS.has(full.slice(full.lastIndexOf(".")))) {
      out.push(full);
    }
  }
  return out;
}

describe("paleta Areia & Coral — regressão de hexes antigos", () => {
  const roots = ["app", "components", "lib"].map((dir) => resolve(process.cwd(), dir));
  const files = [
    ...roots.flatMap((dir) => collectFiles(dir)),
    resolve(process.cwd(), "tailwind.config.ts"),
    resolve(process.cwd(), "app/globals.css"),
  ];

  it.each(LEGACY_HEXES)("não usa mais #%s em app/, components/, lib/ nem nos tokens", (legacy) => {
    const found: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (content.toUpperCase().includes(`#${legacy}`)) found.push(file);
    }
    expect(found).toEqual([]);
  });
});

describe("paleta Areia & Coral — heros e faixas claros", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("header e faixa de oferta usam superfícies claras", () => {
    const header = read("components/site-header.tsx");
    expect(header).toContain("bg-areia-quente");
    expect(header).toContain("border-line-subtle");
    expect(header).not.toContain("bg-surface-dark");
    expect(header).toContain("text-vinho");

    const offer = read("components/marketing/welcome-offer.tsx");
    expect(offer).toContain("bg-areia-secundaria text-vinho");
    expect(offer).not.toMatch(/bg-vinho text-off-white/);
  });

  it("hero, marquee e card de depoimento usam superfícies claras", () => {
    const page = read("app/(marketing)/page.tsx");
    expect(page).toContain("bg-areia-quente");
    expect(page).toContain("text-coral-escuro");
    expect(page).toContain("bg-gradient-to-r from-areia-quente via-champagne-claro to-teal-soft");
    expect(page).toContain("border-line-subtle bg-white p-5 shadow-soft");
    expect(page).toContain("ev-rise text-vinho");
  });

  it("heros de como-funciona, planos e para-planners são claros", () => {
    expect(read("app/(marketing)/como-funciona/page.tsx")).toContain('<section className="bg-areia-quente">');
    expect(read("app/(marketing)/planos/page.tsx")).toContain('<div className="bg-areia-quente text-vinho">');
    const planners = read("app/(marketing)/para-planners/page.tsx");
    expect(planners).toContain("bg-white/95 p-4 text-vinho");
    expect(planners).not.toContain("bg-vinho/95");
  });
});

describe("paleta Areia & Coral — contraste WCAG AA", () => {
  const AA = 4.5;
  const pairs: ReadonlyArray<readonly [string, string, string]> = [
    ["charcoal / areia-quente", PALETTE.ink, PALETTE.areiaQuente],
    ["charcoal / areia-secundaria", PALETTE.ink, PALETTE.areiaSecundaria],
    ["charcoal / white", PALETTE.ink, PALETTE.offWhite],
    ["charcoal / primaria", PALETTE.ink, PALETTE.primaria],
    ["charcoal / primaria-escura", PALETTE.ink, PALETTE.primariaEscura],
    ["charcoal / champagne-claro", PALETTE.ink, PALETTE.champagneClaro],
    ["charcoal / teal-soft", PALETTE.ink, PALETTE.tealSoft],
    ["coral-escuro / areia-quente", PALETTE.coralEscuro, PALETTE.areiaQuente],
    ["coral-escuro / white", PALETTE.coralEscuro, PALETTE.offWhite],
    ["coral-escuro / areia-secundaria", PALETTE.coralEscuro, PALETTE.areiaSecundaria],
    ["white / teal", PALETTE.offWhite, PALETTE.teal],
    ["white / charcoal", PALETTE.offWhite, PALETTE.ink],
    ["primaria / charcoal", PALETTE.primaria, PALETTE.ink],
  ];

  it.each(pairs)("%s ≥ 4,5:1", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });
});

describe("paleta Areia & Coral — pares dos heros claros", () => {
  const AA = 4.5;
  const pairs: ReadonlyArray<readonly [string, string, string]> = [
    ["charcoal / #FBE3D3 (marquee)", PALETTE.ink, PALETTE.champagneClaro],
    ["charcoal / oat (hero)", PALETTE.ink, PALETTE.areiaQuente],
    ["terracotta / oat (destaque do hero)", PALETTE.coralEscuro, PALETTE.areiaQuente],
    ["terracotta / white (card do hero)", PALETTE.coralEscuro, PALETTE.offWhite],
  ];

  it.each(pairs)("%s ≥ 4,5:1", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });
});

describe("tailwind.config.ts espelha PALETTE", () => {
  const colors = config.theme?.extend?.colors as unknown as Record<string, unknown>;
  const surface = colors.surface as Record<string, string>;
  const ink = colors.ink as Record<string, string>;
  const brand = colors.brand as Record<string, string>;

  it("tokens canônicos", () => {
    expect(colors.champagne).toBe(PALETTE.champagne);
    expect(colors.coral).toBe(PALETTE.champagne);
    expect(colors["coral-escuro"]).toBe(PALETTE.coralEscuro);
    expect(colors.noite).toBe(PALETTE.ink);
    expect(colors.terracota).toBe(PALETTE.terracota);
    expect(colors.dourado).toBe(PALETTE.dourado);
    expect(colors["verde-claro"]).toBe(PALETTE.areiaSecundaria);
    expect(colors.teal).toBe(PALETTE.teal);
    expect(colors["teal-soft"]).toBe(PALETTE.tealSoft);
    expect(colors["on-primary"]).toBe(PALETTE.onPrimary);
  });

  it("tokens semânticos", () => {
    expect(surface.canvas).toBe(PALETTE.offWhite);
    expect(surface.warm).toBe(PALETTE.areiaQuente);
    expect(surface.muted).toBe(PALETTE.areiaSecundaria);
    expect(surface.dark).toBe(PALETTE.ink);
    expect(ink.primary).toBe(PALETTE.ink);
    expect(ink.inverse).toBe(PALETTE.offWhite);
    expect(ink.accent).toBe(PALETTE.champagne);
    expect(ink.soft).toBe(PALETTE.champagneClaro);
    expect(ink.onPrimary).toBe(PALETTE.onPrimary);
    expect(brand.primary).toBe(PALETTE.primaria);
    expect(brand.accent).toBe(PALETTE.champagne);
    expect(brand.accentSoft).toBe(PALETTE.champagneClaro);
  });

  it("gradiente oficial", () => {
    const backgroundImage = config.theme?.extend?.backgroundImage as Record<string, string>;
    expect(backgroundImage["gold-sheen"]).toBe(
      `linear-gradient(135deg, ${PALETTE.champagneClaro} 0%, ${PALETTE.primaria} 55%, ${PALETTE.tealSoft} 100%)`,
    );
  });
});
