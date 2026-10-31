// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it } from "vitest";

import {
  FOLLOW_INSTAGRAM_TEXT,
  FollowInstagramCard,
} from "@/components/domain/follow-instagram-card";

afterEach(cleanup);

const EXACT_TEXT =
  "Fazemos tudo pelo Instagram. Siga nossa página e mande uma mensagem no direct: é por lá que avisamos sobre as opções de produtos e entramos em contato com você.";

describe("FollowInstagramCard", () => {
  it("mostra o texto exato em pt-BR", () => {
    render(<FollowInstagramCard />);

    expect(FOLLOW_INSTAGRAM_TEXT).toBe(EXACT_TEXT);
    expect(screen.getByText(EXACT_TEXT)).toBeInTheDocument();
  });

  it("Instagram aponta para a DM (ig.me) e Facebook para o Messenger (m.me)", () => {
    render(<FollowInstagramCard />);

    const instagram = screen.getByRole("link", { name: "Instagram" });
    const facebook = screen.getByRole("link", { name: "Facebook" });

    expect(instagram).toHaveAttribute("href", "https://ig.me/m/eventeia");
    expect(facebook).toHaveAttribute("href", "https://m.me/eventeia");

    for (const link of [instagram, facebook]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("Instagram é o botão primário e Facebook o secundário", () => {
    render(<FollowInstagramCard />);

    expect(screen.getByRole("link", { name: "Instagram" }).className).toMatch(/\bbg-primaria\b/);
    expect(screen.getByRole("link", { name: "Facebook" }).className).not.toMatch(
      /\bbg-primaria\b/,
    );
    expect(screen.getByRole("link", { name: "Facebook" }).className).toMatch(/\bbg-white\b/);
  });
});

describe("regressão: páginas do evento exibem o card", () => {
  const PAGES = [
    "app/(dashboard)/eventos/[id]/entrevista/page.tsx",
    "app/(dashboard)/eventos/[id]/page.tsx",
  ];

  it("renderiza o card na entrevista (logo após a criação) e no detalhe do evento", () => {
    for (const page of PAGES) {
      const source = readFileSync(page, "utf8");
      expect(source).toContain('from "@/components/domain/follow-instagram-card"');
      expect(source).toContain("<FollowInstagramCard />");
    }
  });
});
