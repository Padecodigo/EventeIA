import { describe, expect, it } from "vitest";

import {
  AUTOMATION_MESSAGING_TYPE,
  canSend,
  isHumanAgentTag,
  type SendGuardConversation,
} from "@/lib/outreach/send-guard";

function conv(overrides: Partial<SendGuardConversation> = {}): SendGuardConversation {
  return {
    status: "open",
    windowExpiresAt: "2026-12-31T23:59:59.000Z",
    ...overrides,
  };
}

describe("canSend (guarda de envio da automação Meta)", () => {
  const now = new Date("2026-10-26T14:00:00Z"); // segunda-feira, 11:00 em Brasília

  it("permite quando janela aberta em horário comercial", () => {
    const result = canSend(conv({ windowExpiresAt: "2026-10-26T16:00:00.000Z" }), now);
    expect(result.ok).toBe(true);
  });

  it("bloqueia opt-out", () => {
    expect(canSend(conv({ status: "opted_out" }), now)).toEqual({ ok: false, reason: "opted_out" });
  });

  it("bloqueia canal fechado", () => {
    expect(canSend(conv({ status: "canal_fechado" }), now)).toEqual({
      ok: false,
      reason: "canal_fechado",
    });
  });

  it("bloqueia janela sem expiração", () => {
    expect(canSend(conv({ windowExpiresAt: null }), now)).toEqual({
      ok: false,
      reason: "window_closed",
    });
  });

  it("bloqueia janela já vencida", () => {
    expect(canSend(conv({ windowExpiresAt: "2026-10-26T13:00:00.000Z" }), now)).toEqual({
      ok: false,
      reason: "window_closed",
    });
  });

  it("bloqueia fora do horário comercial (sábado)", () => {
    const saturday = new Date("2026-10-31T14:00:00Z");
    expect(canSend(conv(), saturday)).toEqual({ ok: false, reason: "outside_business_hours" });
  });

  it("bloqueia em feriado nacional fixo (Finados, segunda 02/11)", () => {
    const holiday = new Date("2026-11-02T14:00:00Z");
    expect(canSend(conv(), holiday)).toEqual({ ok: false, reason: "outside_business_hours" });
  });

  it("bloqueia nos feriados móveis calculados pela Páscoa (Carnaval/Sexta Santa/Corpus Christi)", () => {
    for (const holiday of [
      "2026-02-16T14:00:00Z", // Carnaval (segunda)
      "2026-02-17T14:00:00Z", // Carnaval (terça)
      "2026-04-03T14:00:00Z", // Sexta-feira Santa
      "2026-06-04T14:00:00Z", // Corpus Christi
    ]) {
      expect(canSend(conv(), new Date(holiday))).toEqual({
        ok: false,
        reason: "outside_business_hours",
      });
    }
  });

  it("resposta humana direta (usuário) pode sair fora do horário comercial dentro da janela", () => {
    const saturday = new Date("2026-10-31T14:00:00Z");
    expect(canSend(conv(), saturday, { allowOutsideBusinessHours: true }).ok).toBe(true);
    // Mas nunca com janela vencida ou opt-out.
    expect(
      canSend(
        conv({ windowExpiresAt: "2026-10-31T13:00:00.000Z" }),
        saturday,
        { allowOutsideBusinessHours: true },
      ),
    ).toEqual({ ok: false, reason: "window_closed" });
    expect(
      canSend(conv({ status: "opted_out" }), saturday, { allowOutsideBusinessHours: true }),
    ).toEqual({ ok: false, reason: "opted_out" });
  });

  it("bloqueia antes das 09:00 de Brasília", () => {
    const before = new Date("2026-10-26T10:00:00Z"); // 07:00 Brasília
    expect(canSend(conv(), before)).toEqual({ ok: false, reason: "outside_business_hours" });
  });

  it("bloqueia às 18:00 em ponto de Brasília (janela fechada às 18:00)", () => {
    const after = new Date("2026-10-26T21:00:00Z"); // 18:00 Brasília
    expect(canSend(conv(), after)).toEqual({ ok: false, reason: "outside_business_hours" });
  });

  it("AUTOMATION_MESSAGING_TYPE é sempre RESPONSE (nunca tag especial)", () => {
    expect(AUTOMATION_MESSAGING_TYPE).toBe("RESPONSE");
  });

  it("isHumanAgentTag detecta a tag proibida", () => {
    expect(isHumanAgentTag("HUMAN_AGENT")).toBe(true);
    expect(isHumanAgentTag("RESPONSE")).toBe(false);
    expect(isHumanAgentTag(undefined)).toBe(false);
  });
});
