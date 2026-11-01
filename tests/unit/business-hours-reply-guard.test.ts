import { describe, expect, it } from "vitest";

import { assertBusinessHours, OutsideBusinessHoursError } from "@/lib/outreach/business-defer";

function deferral(iso: string): Date | null {
  try {
    assertBusinessHours(new Date(iso));
    return null;
  } catch (error) {
    if (error instanceof OutsideBusinessHoursError) return error.until;
    throw error;
  }
}

describe("regressão: agente só fala com fornecedor em dia útil 09–18 BRT", () => {
  it("domingo 01/11 08:00 BRT → adia até segunda 02/11 09:00 BRT (se for dia útil)", () => {
    const until = deferral("2026-11-01T11:00:00Z");
    expect(until).not.toBeNull();
    expect(until!.getTime()).toBeGreaterThan(new Date("2026-11-01T11:00:00Z").getTime());
    expect(until!.getUTCHours()).toBe(12); // 09:00 BRT
  });
  it("terça 10:00 BRT → liberado", () => {
    expect(deferral("2026-11-03T13:00:00Z")).toBeNull();
  });
  it("terça 18:00 BRT em ponto → adia (janela fecha às 18:00)", () => {
    expect(deferral("2026-11-03T21:00:00Z")).not.toBeNull();
  });
  it("terça 08:59 BRT → adia para 09:00 do mesmo dia", () => {
    expect(deferral("2026-11-03T11:59:00Z")?.toISOString()).toBe("2026-11-03T12:00:00.000Z");
  });
});
