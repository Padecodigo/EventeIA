import { describe, expect, it } from "vitest";

import { buildSelectionMessage, relayDecision } from "@/lib/selection/relay";
import type { SendGuardConversation } from "@/lib/outreach/send-guard";

const now = new Date("2026-10-26T14:00:00Z"); // segunda-feira, 11:00 em Brasília (dia útil, horário comercial)

function openConversation(overrides: Partial<SendGuardConversation> = {}): SendGuardConversation {
  return { status: "open", windowExpiresAt: "2026-10-26T16:00:00.000Z", ...overrides };
}

describe("relayDecision (escolha enviada só dentro da janela aberta)", () => {
  it("envia quando a janela está aberta em horário comercial", () => {
    const decision = relayDecision("pendente", openConversation(), now);
    expect(decision.action).toBe("send");
    expect(decision.nextStatus).toBe("enviado_ao_fornecedor");
  });

  it("fecha a seleção quando a janela já venceu", () => {
    const decision = relayDecision(
      "pendente",
      openConversation({ windowExpiresAt: "2026-10-26T13:00:00.000Z" }),
      now,
    );
    expect(decision.action).toBe("close");
    expect(decision.nextStatus).toBe("canal_fechado");
  });

  it("fecha a seleção quando a conversa já está canal_fechado", () => {
    const decision = relayDecision(
      "pendente",
      openConversation({ status: "canal_fechado" }),
      now,
    );
    expect(decision.action).toBe("close");
    expect(decision.nextStatus).toBe("canal_fechado");
  });

  it("marca indisponivel no opt-out do fornecedor", () => {
    const decision = relayDecision("pendente", openConversation({ status: "opted_out" }), now);
    expect(decision.action).toBe("close");
    expect(decision.nextStatus).toBe("indisponivel");
  });

  it("aguarda (mantém pendente) fora do horário comercial", () => {
    const saturday = new Date("2026-10-31T14:00:00Z");
    const decision = relayDecision(
      "pendente",
      openConversation({ windowExpiresAt: "2026-10-31T23:59:59.000Z" }),
      saturday,
    );
    expect(decision.action).toBe("wait");
    expect(decision.nextStatus).toBe("pendente");
    expect(decision.reason).toBe("outside_business_hours");
  });

  it("não re-envia de estados não relayáveis", () => {
    for (const status of ["enviado_ao_fornecedor", "aguardando_resposta", "respondido"] as const) {
      const decision = relayDecision(status, openConversation(), now);
      expect(decision.action).toBe("wait");
      expect(decision.nextStatus).toBe(status);
    }
  });
});

describe("buildSelectionMessage (pt-BR, sem URLs/rodapé)", () => {
  it("monta a mensagem de confirmação da escolha", () => {
    const message = buildSelectionMessage({
      supplierName: "Buffet do Vale",
      eventTitle: "Festa da Alice",
      optionName: "Churrasco completo",
      priceFormatted: "R$ 89,00 por pessoa",
    });
    expect(message).toContain('"Churrasco completo"');
    expect(message).toContain("R$ 89,00 por pessoa");
    expect(message).not.toMatch(/https?:\/\//);
  });

  it("lida com fornecedor sem nome e preço vazio", () => {
    const message = buildSelectionMessage({
      supplierName: "",
      eventTitle: "Evento",
      optionName: "Pacote prata",
      priceFormatted: "",
    });
    expect(message).toContain("olá");
    expect(message).not.toContain("()");
  });
});
