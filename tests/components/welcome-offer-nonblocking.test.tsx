// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/script", () => ({ default: () => null }));

const { WelcomeOffer } = await import("@/components/marketing/welcome-offer");
const SCRIPT = readFileSync("public/welcome-offer.js", "utf8");

function mount(): void {
  document.body.innerHTML = `${renderToStaticMarkup(<WelcomeOffer />)}<header class="sticky top-0 z-50"><nav><a id="nav-planos" href="/planos">Planos</a></nav></header><main><a id="cta" href="/registrar">Começar</a></main>`;
}
async function runScript(status = "active"): Promise<void> {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ status }) })) as unknown as typeof fetch;
  new Function(SCRIPT)();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("regressão: oferta de boas-vindas não bloqueia a navegação", () => {
  beforeEach(() => {
    localStorage.clear();
    mount();
  });

  it("faixas ficam no fluxo (sem fixed/absolute/overlay) e não sobrepõem o header", () => {
    for (const id of ["ev-welcome-banner", "ev-lucky-banner"]) {
      const cls = document.getElementById(id)?.className ?? "";
      expect(cls).not.toMatch(/\b(fixed|absolute|sticky|inset-0|inset-x-0|top-0)\b/);
      expect(cls).not.toMatch(/z-\[?\d/);
    }
    expect(document.querySelectorAll("[class*='inset-0']")).toHaveLength(0);
    // Selo minimizado fica abaixo do header (z-30 < z-50) e no canto inferior.
    const badge = document.getElementById("ev-offer-badge")?.className ?? "";
    expect(badge).toMatch(/bottom-4/);
    expect(badge).toMatch(/z-30/);
  });

  it("links do menu e CTAs seguem clicáveis com a faixa visível", async () => {
    await runScript();
    expect(document.getElementById("ev-welcome-banner")?.hidden).toBe(false);
    const onNav = vi.fn((e: Event) => e.preventDefault());
    const nav = document.getElementById("nav-planos") as HTMLAnchorElement;
    nav.addEventListener("click", onNav);
    nav.click();
    expect(onNav).toHaveBeenCalledTimes(1);
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("minimizar vira selo e é lembrado entre páginas; selo reabre", async () => {
    await runScript();
    (document.querySelector("[data-welcome-dismiss]") as HTMLButtonElement).click();
    expect(document.getElementById("ev-welcome-banner")?.hidden).toBe(true);
    expect(document.getElementById("ev-offer-badge")?.hidden).toBe(false);
    expect(localStorage.getItem("ev-offer-minimized")).toBe("1");

    mount();
    await runScript();
    expect(document.getElementById("ev-welcome-banner")?.hidden).toBe(true);
    const badge = document.getElementById("ev-offer-badge") as HTMLButtonElement;
    expect(badge.hidden).toBe(false);
    badge.click();
    expect(document.getElementById("ev-welcome-banner")?.hidden).toBe(false);
    expect(localStorage.getItem("ev-offer-minimized")).toBeNull();
  });
});
