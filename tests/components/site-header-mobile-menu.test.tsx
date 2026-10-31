// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: function MockLink({
    href,
    children,
    onClick,
  }: {
    href: string;
    children?: ReactNode;
    onClick?: () => void;
  }) {
    return (
      <a href={href} onClick={onClick}>
        {children}
      </a>
    );
  },
}));

import { SiteHeaderMobileMenu } from "@/components/site-header-mobile-menu";

afterEach(cleanup);

describe("SiteHeaderMobileMenu", () => {
  it("botão hambúrguer expõe aria-expanded/aria-controls e alterna o painel", () => {
    render(<SiteHeaderMobileMenu />);
    const button = screen.getByRole("button", { name: "Abrir menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "menu-mobile");

    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Fechar menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("navigation", { name: "Menu móvel" })).toBeInTheDocument();
  });

  it("abre o painel com os cinco itens de navegação", () => {
    render(<SiteHeaderMobileMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    for (const label of ["Como funciona", "Para planners", "Planos", "Entrar", "Começar agora"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("fecha ao clicar em um link", () => {
    render(<SiteHeaderMobileMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    fireEvent.click(screen.getByRole("link", { name: "Planos" }));

    expect(screen.queryByRole("navigation", { name: "Menu móvel" })).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir menu" })).toBeInTheDocument();
  });

  it("fecha ao pressionar Escape", () => {
    render(<SiteHeaderMobileMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("navigation", { name: "Menu móvel" })).toBeNull();
  });
});
