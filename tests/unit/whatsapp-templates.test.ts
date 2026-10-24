import { describe, expect, it } from "vitest";

import {
  OPT_OUT_FOOTER,
  renderEventReady,
  renderPaymentReminder,
  renderQuotationSummary,
  renderQuoteDelivery,
  renderTestimonialInvite,
} from "@/lib/whatsapp/templates";

describe("templates de WhatsApp", () => {
  it("monta a entrega da cotação com rodapé de opt-out", () => {
    const body = renderQuoteDelivery({
      recipientName: "Ana",
      eventTitle: "Casamento de Ana e João",
      eventDate: "20/11/2026",
      totalFormatted: "R$ 47.649,80",
      link: "https://EventeIA.com/e/abc",
    });

    expect(body).toContain("Ana");
    expect(body).toContain("R$ 47.649,80");
    expect(body).toContain("https://EventeIA.com/e/abc");
    expect(body.endsWith(OPT_OUT_FOOTER)).toBe(true);
  });

  it("monta o lembrete de pagamento", () => {
    const body = renderPaymentReminder({
      recipientName: "Bruno",
      amountFormatted: "R$ 47,00",
      expiresInLabel: "expira em 25 minutos",
      link: "https://EventeIA.com/p/abc",
    });

    expect(body).toContain("R$ 47,00");
    expect(body.endsWith(OPT_OUT_FOOTER)).toBe(true);
  });

  it("monta o aviso de evento liberado", () => {
    const body = renderEventReady({
      recipientName: "Carla",
      eventTitle: "Formatura 2026",
      link: "https://EventeIA.com/e/xyz",
    });

    expect(body).toContain("Formatura 2026");
    expect(body.endsWith(OPT_OUT_FOOTER)).toBe(true);
  });

  it("monta o convite de depoimento pós-evento", () => {
    const body = renderTestimonialInvite({
      recipientName: "Camila",
      eventTitle: "Festa de 5 anos da Lia",
      link: "https://EventeIA.com/depoimento?token=abc",
    });

    expect(body).toContain("Camila");
    expect(body).toContain("Festa de 5 anos da Lia");
    expect(body).toContain("https://EventeIA.com/depoimento?token=abc");
    expect(body.endsWith(OPT_OUT_FOOTER)).toBe(true);
  });

  it("monta o resumo de cotações do evento", () => {
    const body = renderQuotationSummary({
      eventTitle: "Festa de 5 anos da Lia",
      lines: [
        { vendor: "Buffet da Vila", category: "Buffet", amountFormatted: "R$ 4.200,00" },
        { vendor: "Ateliê Flor", category: "Decoração", amountFormatted: "R$ 2.100,00" },
      ],
      totalFormatted: "R$ 6.300,00",
      link: "https://EventeIA.com/eventos/abc",
    });

    expect(body).toContain("Festa de 5 anos da Lia");
    expect(body).toContain("Buffet da Vila");
    expect(body).toContain("R$ 6.300,00");
    expect(body.endsWith(OPT_OUT_FOOTER)).toBe(true);
  });

  it("rejeita variáveis inválidas", () => {
    expect(() =>
      renderQuoteDelivery({
        recipientName: "",
        eventTitle: "X",
        eventDate: "01/01/2027",
        totalFormatted: "R$ 1,00",
        link: "https://EventeIA.com/e/1",
      }),
    ).toThrow();

    expect(() =>
      renderEventReady({
        recipientName: "Carla",
        eventTitle: "Formatura",
        link: "nao-e-url",
      }),
    ).toThrow();
  });
});
