import { describe, expect, it } from "vitest";

import {
  recordQuotationsReady,
  renderQuotationsReadyEmail,
  type NotificationDeps,
} from "@/lib/notifications/quotations-ready";

const base = {
  displayName: "Ana Lima",
  eventTitle: "Casamento",
} as const;

describe("e-mail quotations_ready — prontidão da coleta", () => {
  it("completo: só aqui afirma que o orçamento de menor preço está pronto", () => {
    const email = renderQuotationsReadyEmail({
      ...base,
      reason: "collection_complete",
      readiness: { status: "complete" },
    });
    expect(email.subject).toBe('Seu orçamento de "Casamento" está pronto');
    expect(email.text).toContain("O orçamento de menor preço já está organizado no seu painel.");
  });

  it("parcial: informa as categorias faltantes e não promete menor preço", () => {
    const email = renderQuotationsReadyEmail({
      ...base,
      reason: "window_closed",
      readiness: { status: "incomplete", uncovered: ["doces"] },
    });
    expect(email.subject).toContain("encerrada com pendências");
    expect(email.text).toContain("Ainda faltam cotações válidas para: doces.");
    expect(email.text).toContain(
      "só pode ser confirmado quando todas as necessidades estiverem cobertas",
    );
    expect(email.text).not.toContain("já está organizado");
  });

  it("sem cotações: encerra sem afirmar orçamento pronto", () => {
    const email = renderQuotationsReadyEmail({
      ...base,
      reason: "session_lost",
      readiness: { status: "empty" },
    });
    expect(email.subject).toBe('Coleta de cotações de "Casamento" encerrada');
    expect(email.text).toContain("Não recebemos cotações válidas para este evento.");
    expect(email.text).not.toContain("já está organizado");
  });

  it("grava a prontidão no payload da notificação", async () => {
    const inserted: Parameters<NotificationDeps["insertNotification"]>[0][] = [];
    const deps: NotificationDeps = {
      getOwnerContact: () => Promise.resolve({ profileId: "u1", email: null, ...base }),
      insertNotification: (row) => {
        inserted.push(row);
        return Promise.resolve("n1");
      },
      markEmailSent: () => Promise.resolve(),
      email: { mode: "mock", send: () => Promise.resolve({ id: null }) },
      warn: () => undefined,
    };

    await recordQuotationsReady(deps, {
      eventId: "e1",
      reason: "window_closed",
      readiness: { status: "incomplete", uncovered: ["doces"] },
    });

    expect(inserted[0]?.payload.readiness).toEqual({ status: "incomplete", uncovered: ["doces"] });
  });
});
