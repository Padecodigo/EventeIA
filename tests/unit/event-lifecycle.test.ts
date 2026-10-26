import { describe, expect, it } from "vitest";

import { canCancelEvent, canCompleteEvent, isEventStatus } from "@/lib/events/lifecycle";

describe("ciclo de vida do evento", () => {
  it("encerrar somente a partir de um evento ativo", () => {
    expect(canCompleteEvent("active")).toBe(true);
    for (const status of ["draft", "awaiting_payment", "completed", "canceled", "desconhecido"]) {
      expect(canCompleteEvent(status)).toBe(false);
    }
  });

  it("excluir (soft delete) de qualquer status não cancelado", () => {
    for (const status of ["draft", "awaiting_payment", "active", "completed"]) {
      expect(canCancelEvent(status)).toBe(true);
    }
    expect(canCancelEvent("canceled")).toBe(false);
    expect(canCancelEvent("excluido")).toBe(false);
  });

  it("reconhece apenas os status canônicos", () => {
    for (const status of ["draft", "awaiting_payment", "active", "completed", "canceled"]) {
      expect(isEventStatus(status)).toBe(true);
    }
    expect(isEventStatus("deleted")).toBe(false);
  });
});
