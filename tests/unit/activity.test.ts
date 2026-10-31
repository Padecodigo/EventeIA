import { describe, expect, it } from "vitest";

import {
  ACTIVITY_LABELS,
  activityDetailFromPayload,
  activityLabel,
} from "@/lib/activity/pure";

describe("rótulos do histórico", () => {
  it("mapeiam eventos canônicos para texto humano", () => {
    expect(activityLabel("payment.confirmed")).toBe("Pagamento confirmado");
    expect(activityLabel("quotation.dispatched")).toBe("Resumo entregue");
    expect(activityLabel("credits.consumed")).toBe("Crédito consumido");
    expect(activityLabel("consent.opted_in")).toBe("Contato autorizado");
  });

  it("evento desconhecido cai no próprio tipo (nunca vazio)", () => {
    expect(activityLabel("x.custom")).toBe("x.custom");
  });

  it("todos os rótulos do mapa são não-vazios", () => {
    for (const [key, value] of Object.entries(ACTIVITY_LABELS)) {
      expect(key.length).toBeGreaterThan(0);
      expect(value.length).toBeGreaterThan(3);
    }
  });
});

describe("detalhe do histórico", () => {
  // Intl pt-BR usa espaço inseparável (U+00A0); normalizamos para comparar.
  const brl = (cents: number): string | undefined =>
    activityDetailFromPayload({ amount_cents: cents })?.replace(/\u00a0/g, " ");

  it("formata centavos como BRL", () => {
    expect(brl(9700)).toBe("R$ 97,00");
    expect(brl(11700)).toBe("R$ 117,00");
  });

  it("descreve créditos, cotações e canal", () => {
    expect(activityDetailFromPayload({ credits: 1 })).toBe("1 crédito(s)");
    expect(activityDetailFromPayload({ quotations: 3 })).toBe("3 cotação(ões)");
    expect(activityDetailFromPayload({ channel: "whatsapp" })).toBe("legado");
  });

  it("retorna undefined para payload vazio ou inválido", () => {
    expect(activityDetailFromPayload(null)).toBeUndefined();
    expect(activityDetailFromPayload("texto")).toBeUndefined();
    expect(activityDetailFromPayload({})).toBeUndefined();
  });
});
