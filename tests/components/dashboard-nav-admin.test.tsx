// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/painel" }));

import { DashboardNav } from "@/components/dashboard-nav";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(cleanup);

describe("DashboardNav", () => {
  it("mostra a seção Admin com todas as páginas para admin", () => {
    render(<DashboardNav isAdmin />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const h of [
      "/admin",
      "/admin/financeiro",
      "/admin/consumo",
      "/admin/depoimentos",
      "/admin/cupons",
      "/admin/chamados",
      "/painel",
    ])
      expect(hrefs).toContain(h);
  });
  it("regressão: não mostra Admin para usuário comum", () => {
    render(<DashboardNav />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.startsWith("/admin"))).toBe(false);
  });
});
