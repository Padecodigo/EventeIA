// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let path = "/admin/financeiro";
vi.mock("next/navigation", () => ({ usePathname: () => path }));

import { AdminTopNav } from "@/components/admin/admin-top-nav";
import { DashboardNav } from "@/components/dashboard-nav";
import { ADMIN_NAV } from "@/lib/admin/nav";

afterEach(cleanup);

describe("AdminTopNav", () => {
  it("lista Início, todas as seções do admin, Painel e Ver site", () => {
    render(<AdminTopNav />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/admin", ...ADMIN_NAV.map((i) => i.href), "/painel", "/"]);
  });
  it("marca só a seção atual (inclusive subrotas)", () => {
    path = "/admin/clientes/abc";
    render(<AdminTopNav />);
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.getAttribute("href"))).toEqual(["/admin/clientes"]);
  });
  it("no celular vira uma linha rolável (sem estourar a largura da tela)", () => {
    render(<AdminTopNav />);
    const nav = screen.getByRole("navigation", { name: "Seções do admin" });
    expect(nav.className).toContain("overflow-x-auto");
    expect(nav.className).toContain("whitespace-nowrap");
  });
});

describe("DashboardNav responsivo", () => {
  it("rola na horizontal até telas grandes (admin tem muitos links)", () => {
    path = "/painel";
    const { container } = render(<DashboardNav isAdmin />);
    const nav = container.querySelector("nav")!;
    expect(nav.className).toContain("overflow-x-auto");
    expect(nav.className).toContain("xl:overflow-visible");
  });
});
