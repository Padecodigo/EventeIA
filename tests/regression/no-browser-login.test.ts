import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ADMIN_NAV } from "@/lib/admin/nav";

describe("sem login automatizado por navegador (Termos do Instagram)", () => {
  it("não mantém diretórios/arquivos de login automatizado", () => {
    expect(existsSync("lib/instagram-browser")).toBe(false);
    expect(existsSync("app/admin/instagram")).toBe(false);
    expect(existsSync("scripts/instagram-login.ts")).toBe(false);
  });

  it("não declara playwright nem script instagram:login no package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(pkg.dependencies ?? {}).not.toHaveProperty("playwright");
    expect(pkg.devDependencies ?? {}).not.toHaveProperty("playwright");
    expect(pkg.scripts ?? {}).not.toHaveProperty("instagram:login");
  });

  it("não expõe item /admin/instagram na navegação", () => {
    expect(ADMIN_NAV.some((item) => item.href === "/admin/instagram")).toBe(false);
  });
});
