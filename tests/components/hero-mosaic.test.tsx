// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill: _fill, priority: _priority, quality: _quality, ...props }: ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>) => <img {...props} />,
}));

import { HeroMosaic, MOSAIC } from "@/components/marketing/hero-mosaic";

afterEach(cleanup);

describe("HeroMosaic", () => {
  it("renderiza todas as fotos aprovadas, incluindo a de formatura", () => {
    render(<HeroMosaic />);
    expect(MOSAIC).toHaveLength(6);
    for (const photo of MOSAIC) {
      const img = screen.getByAltText(photo.alt);
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", photo.src);
      expect(screen.getByText(photo.label)).toBeInTheDocument();
    }
    expect(screen.getByText("Formatura")).toBeInTheDocument();
  });

  it("nenhuma foto é escondida por classe hidden/invisible/display:none", () => {
    const { container } = render(<HeroMosaic />);
    const figures = container.querySelectorAll("figure");
    expect(figures).toHaveLength(MOSAIC.length);
    figures.forEach((figure) => {
      expect(figure.className).not.toMatch(/(?:^|\s)(?:\w+:)?(?:hidden|invisible|opacity-0)(?:\s|$)/);
      expect(figure.getAttribute("style") ?? "").not.toMatch(/display:\s*none/);
    });
  });

  it("nenhuma foto sobrepõe outra (sem posicionamento absoluto)", () => {
    const { container } = render(<HeroMosaic />);
    for (const figure of container.querySelectorAll("figure")) {
      expect(figure.className).not.toMatch(/\babsolute\b/);
    }
  });

  it("fotos ficam inteiras: object-contain, nunca object-cover, sem zoom", () => {
    const { container } = render(<HeroMosaic />);
    for (const img of container.querySelectorAll("img")) {
      expect(img.className).toContain("object-contain");
      expect(img.className).toContain("h-auto");
      expect(img.className).toContain("w-full");
      expect(img.className).not.toContain("object-cover");
      expect(img.className).not.toContain("scale-110");
    }
  });

  it("usa as dimensões reais de cada arquivo (largura/altura)", () => {
    for (const photo of MOSAIC) {
      expect(photo.w).toBeGreaterThan(0);
      expect(photo.h).toBeGreaterThan(0);
    }
  });
});
