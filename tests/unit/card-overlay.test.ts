import { describe, expect, it } from "vitest";

import {
  buildBannerSvg,
  buildReceiptCardSvg,
  HEADLINES_BY_THEME,
} from "@/lib/marketing/card-overlay";

const headline = HEADLINES_BY_THEME.casamento ?? ["Casamento", "com calma"];

describe("overlay publicitário", () => {
  it("anúncio claro usa serif, pílula e não aplica letter-spacing", () => {
    const svg = buildBannerSvg(headline, 1080, 1080, "lifestyle");
    expect(svg).toContain("Liberation Serif");
    expect(svg).toContain("O orçamento claro");
    expect(svg).toContain("para viver o amor.");
    expect(svg).toContain("Sem planilha no grande dia.");
    expect(svg).toContain(`x="${Math.round(1080 * 0.07)}"`);
    expect(svg).toContain('x2="0" y2="1"');
    expect(svg).toContain("eventeia.com.br");
    expect(svg).toContain("EventeIA");
    expect(svg).not.toContain("letter-spacing");
  });

  it("quadro editorial mantém o título claro sobre o degradê, sem letter-spacing", () => {
    const svg = buildBannerSvg(headline, 1080, 1920, "editorial");
    expect(svg).toContain("O orçamento claro");
    expect(svg).not.toContain("Sem planilha no grande dia.");
    expect(svg).toContain("#FFFDFA");
    expect(svg).toContain("#D4AF37");
    expect(svg).not.toContain("letter-spacing");
    expect(svg).not.toContain("eventeia.com.br");
  });

  it("cartão cabe o rótulo e a categoria, sem letter-spacing", () => {
    const svg = buildReceiptCardSvg(["Buffet infantil", "Decoração"], 1080, 1080);
    expect(svg).toContain("Orçamento recebido");
    expect(svg).toContain("Buffet infantil");
    expect(svg).toContain("Decoração");
    expect(svg).not.toContain("letter-spacing");
  });
});
