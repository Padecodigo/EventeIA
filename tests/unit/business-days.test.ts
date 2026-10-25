import { describe, expect, it } from "vitest";

import { quotePreparingCopy } from "@/components/domain/quote-preparing-notice";
import {
  addBusinessDays,
  brazilHolidays,
  DISCOVERY_WINDOW,
  easterSunday,
  formatDayLabel,
  isBusinessDay,
  isWithinBusinessWindow,
  msUntilBusinessWindow,
  nextBusinessWindowStart,
  OUTREACH_WINDOW,
} from "@/lib/business-days";

describe("feriados nacionais", () => {
  it("calcula a Páscoa e os feriados móveis", () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(easterSunday(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
    const h = brazilHolidays(2026);
    for (const d of ["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-11-02", "2026-11-20", "2026-12-25", "2026-09-07"]) {
      expect(h.has(d)).toBe(true);
    }
    expect(h.has("2026-10-26")).toBe(false);
  });
  it("fim de semana e feriado não são úteis (fuso SP)", () => {
    expect(isBusinessDay(new Date("2026-10-24T15:00:00Z"))).toBe(false); // sábado
    expect(isBusinessDay(new Date("2026-11-02T15:00:00Z"))).toBe(false); // Finados
    expect(isBusinessDay(new Date("2026-10-26T15:00:00Z"))).toBe(true);
    // sex 23h SP = sáb 02h UTC → ainda sexta em SP
    expect(isBusinessDay(new Date("2026-10-31T02:00:00Z"))).toBe(true);
  });
});

describe("janelas", () => {
  it("contato 9–18h; descoberta 8–18h", () => {
    expect(isWithinBusinessWindow(new Date("2026-10-26T11:30:00Z"), OUTREACH_WINDOW)).toBe(false); // 8h30
    expect(isWithinBusinessWindow(new Date("2026-10-26T11:30:00Z"), DISCOVERY_WINDOW)).toBe(true);
    expect(isWithinBusinessWindow(new Date("2026-10-26T20:59:00Z"), OUTREACH_WINDOW)).toBe(true); // 17h59
    expect(isWithinBusinessWindow(new Date("2026-10-26T21:00:00Z"), OUTREACH_WINDOW)).toBe(false); // 18h
  });
  it("adia para o próximo dia útil, pulando feriado", () => {
    // sexta 30/10 19h SP → seg 02/11 é Finados → ter 03/11 9h SP
    expect(nextBusinessWindowStart(new Date("2026-10-30T22:00:00Z"), OUTREACH_WINDOW).toISOString()).toBe("2026-11-03T12:00:00.000Z");
    // segunda 07h SP → mesmo dia 9h
    expect(nextBusinessWindowStart(new Date("2026-10-26T10:00:00Z"), OUTREACH_WINDOW).toISOString()).toBe("2026-10-26T12:00:00.000Z");
    expect(msUntilBusinessWindow(new Date("2026-10-26T13:00:00Z"), OUTREACH_WINDOW)).toBe(0);
  });
  it("prazo de 2 dias úteis", () => {
    expect(addBusinessDays(new Date("2026-10-26T13:00:00Z"), 2)).toBe("2026-10-28"); // seg → qua
    expect(addBusinessDays(new Date("2026-10-24T13:00:00Z"), 2)).toBe("2026-10-28"); // sáb → começa seg
    expect(addBusinessDays(new Date("2026-10-29T13:00:00Z"), 2)).toBe("2026-11-03"); // qui → pula fds+Finados
    expect(formatDayLabel("2026-10-28")).toBe("quarta, 28/10");
  });
});

describe("aviso ao cliente", () => {
  it("em dia útil diz que já está buscando; fora, diz quando começa", () => {
    expect(quotePreparingCopy(new Date("2026-10-26T13:00:00Z")).detail).toContain("já está buscando");
    const sat = quotePreparingCopy(new Date("2026-10-24T13:00:00Z"));
    expect(sat.headline).toContain("até 2 dias úteis (até quarta, 28/10)");
    expect(sat.detail).toContain("segunda, 26/10, às 9h");
  });
});
