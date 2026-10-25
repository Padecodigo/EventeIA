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

/** Extrai a faixa horizontal (em % do container) a partir das classes Tailwind de posição. */
function horizontalSpan(pos: string): [number, number] {
  const width = Number(/(?:^|\s)w-\[(\d+(?:\.\d+)?)%\]/.exec(pos)?.[1]);
  const left = /(?:^|\s)left-(?:\[(\d+(?:\.\d+)?)%\]|(0))/.exec(pos);
  const right = /(?:^|\s)right-(?:\[(\d+(?:\.\d+)?)%\]|(0))/.exec(pos);
  if (left) {
    const l = Number(left[1] ?? left[2]);
    return [l, l + width];
  }
  if (right) {
    const r = Number(right[1] ?? right[2]);
    return [100 - r - width, 100 - r];
  }
  throw new Error(`posição sem left/right: ${pos}`);
}

function overlapRatio(a: [number, number], b: [number, number]): number {
  const overlap = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
  return overlap / Math.min(a[1] - a[0], b[1] - b[0]);
}

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

  it("fotos da mesma fileira não se cobrem (sobreposição horizontal ≤ 15%)", () => {
    const rows = {
      top: MOSAIC.filter((p) => /(?:^|\s)top-/.test(p.pos)),
      bottom: MOSAIC.filter((p) => /(?:^|\s)bottom-/.test(p.pos)),
    };
    expect(rows.top.length + rows.bottom.length).toBe(MOSAIC.length);
    for (const row of Object.values(rows)) {
      for (let i = 0; i < row.length; i++) {
        for (let j = i + 1; j < row.length; j++) {
          const ratio = overlapRatio(horizontalSpan(row[i].pos), horizontalSpan(row[j].pos));
          expect(ratio, `${row[i].label} x ${row[j].label}`).toBeLessThanOrEqual(0.15);
        }
      }
    }
  });
});
