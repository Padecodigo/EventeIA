import { describe, expect, it } from "vitest";

import {
  CONSENT_TEXT,
  CONSENT_VERSION,
  initialsFromName,
  isEligibleForInvite,
  isInviteUsable,
  toCardData,
  type PublishedTestimonialRow,
} from "@/lib/testimonials/pure";

describe("convite de depoimento", () => {
  const now = new Date("2026-10-22T12:00:00Z");

  it("aceita convite não usado e não expirado", () => {
    expect(
      isInviteUsable({ expires_at: "2026-11-21T12:00:00Z", used_at: null }, now),
    ).toBe(true);
  });

  it("recusa convite usado", () => {
    expect(
      isInviteUsable(
        { expires_at: "2026-11-21T12:00:00Z", used_at: "2026-10-22T10:00:00Z" },
        now,
      ),
    ).toBe(false);
  });

  it("recusa convite expirado", () => {
    expect(
      isInviteUsable({ expires_at: "2026-10-21T12:00:00Z", used_at: null }, now),
    ).toBe(false);
  });
});

describe("elegibilidade do convite automático", () => {
  const today = "2026-10-22";

  it("convida eventos ativos/concluídos de 1 a 30 dias atrás", () => {
    expect(isEligibleForInvite({ event_date: "2026-10-21", status: "active" }, today)).toBe(true);
    expect(isEligibleForInvite({ event_date: "2026-09-25", status: "completed" }, today)).toBe(
      true,
    );
  });

  it("não convida no dia do evento, eventos antigos ou cancelados", () => {
    expect(isEligibleForInvite({ event_date: "2026-10-22", status: "active" }, today)).toBe(false);
    expect(isEligibleForInvite({ event_date: "2026-08-01", status: "active" }, today)).toBe(false);
    expect(isEligibleForInvite({ event_date: "2026-10-20", status: "canceled" }, today)).toBe(false);
    expect(isEligibleForInvite({ event_date: "2026-10-20", status: "draft" }, today)).toBe(false);
  });
});

describe("apresentação do depoimento", () => {
  it("gera iniciais de nomes simples e compostos", () => {
    expect(initialsFromName("Camila Rezende")).toBe("CR");
    expect(initialsFromName("Débora")).toBe("D");
    expect(initialsFromName("  Ana  Paula  Lima ")).toBe("AL");
  });

  it("converte a linha publicada em card, com fallbacks", () => {
    const row: PublishedTestimonialRow = {
      id: "t1",
      author_name: "Camila Rezende",
      city: null,
      event_context: null,
      quote: "Uma história real sobre clareza no orçamento do evento da família.",
      outcome: null,
      audience: "b2c",
      published_at: null,
    };

    const card = toCardData(row, 0);

    expect(card.name).toBe("Camila Rezende");
    expect(card.initials).toBe("CR");
    expect(card.context).toBe("Evento na EventeIA");
    expect(card.city).toBe("");
    expect(card.outcome).toBe("");
    expect(card.tone).toBe("champagne");
  });

  it("alterna tons entre cards", () => {
    const base: PublishedTestimonialRow = {
      id: "x",
      author_name: "Pessoa Teste",
      city: "Recife, PE",
      event_context: "Casamento · 80 convidados",
      quote: "Texto de teste com contexto suficiente para o card de depoimento.",
      outcome: "Resultado",
      audience: "b2b",
      published_at: "2026-10-22T12:00:00Z",
    };

    expect([0, 1, 2, 3].map((index) => toCardData(base, index).tone)).toEqual([
      "champagne",
      "vinho",
      "areia",
      "champagne",
    ]);
  });
});

describe("consentimento", () => {
  it("versão segue o formato YYYY-MM-vN (bump a cada mudança de texto)", () => {
    expect(CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-v\d+$/);
  });

  it("tem texto claro e versionado", () => {
    expect(CONSENT_VERSION.length).toBeGreaterThan(4);
    expect(CONSENT_TEXT.length).toBeGreaterThan(120);
    expect(CONSENT_TEXT).toContain("LGPD");
    expect(CONSENT_TEXT).toContain("remoção");
  });
});
