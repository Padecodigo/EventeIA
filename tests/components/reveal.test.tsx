// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Reveal } from "@/components/marketing/reveal";

function mockMatchMedia(reduce: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  mockMatchMedia(false);
});

afterEach(cleanup);

describe("Reveal (scroll sutil)", () => {
  it("renderiza os filhos dentro de um wrapper com a classe de transição", () => {
    const { container } = render(
      <Reveal>
        <p>conteúdo visível</p>
      </Reveal>,
    );

    expect(screen.getByText("conteúdo visível")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("ev-reveal");
  });

  it("com prefers-reduced-motion não aplica a classe que esconde o conteúdo", () => {
    mockMatchMedia(true);
    const { container } = render(
      <Reveal>
        <p>sem animação</p>
      </Reveal>,
    );

    expect(screen.getByText("sem animação")).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass("ev-reveal-hidden");
  });
});
