import { describe, expect, it } from "vitest";

import { DASHBOARD_NAV, isActivePath } from "@/components/dashboard-nav";

describe("navegação do painel", () => {
  it("marca a seção atual, inclusive em subrotas", () => {
    expect(isActivePath("/painel", "/painel")).toBe(true);
    expect(isActivePath("/eventos/abc", "/eventos")).toBe(true);
    expect(isActivePath("/eventos", "/painel")).toBe(false);
    expect(isActivePath("/perfilx", "/perfil")).toBe(false);
  });
  it("lista as 4 seções", () => {
    expect(DASHBOARD_NAV.map((i) => i.href)).toEqual(["/painel", "/eventos", "/creditos", "/perfil"]);
  });
});
