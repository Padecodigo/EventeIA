import { describe, expect, it } from "vitest";

import { quotePreparingCopy } from "@/components/domain/quote-preparing-notice";
import {
  canEditSearchStart,
  msUntilSearchStart,
  parseSearchStartInput,
  searchStartInstant,
  spDateKey,
  validateSearchStartDate,
} from "@/lib/search-start";

const SUN = new Date("2026-10-25T10:00:00Z"); // domingo 07h SP

describe("validateSearchStartDate (dia útil, servidor)", () => {
  it("aceita dia útil futuro antes do evento", () => {
    expect(validateSearchStartDate("2026-10-26", "2026-12-20", SUN)).toBeNull();
  });
  it("rejeita sábado e domingo", () => {
    expect(validateSearchStartDate("2026-10-31", "2026-12-20", SUN)).toMatch(/dia útil/);
    expect(validateSearchStartDate("2026-11-01", "2026-12-20", SUN)).toMatch(/dia útil/);
  });
  it("rejeita feriados nacionais fixos e móveis", () => {
    for (const d of ["2026-11-02", "2026-11-20", "2027-02-08", "2027-02-09", "2027-03-26", "2027-05-27"]) {
      expect(validateSearchStartDate(d, "2027-12-20", SUN), d).toMatch(/feriados/);
    }
  });
  it("rejeita passado, data do evento ou depois, e formato inválido", () => {
    expect(validateSearchStartDate("2026-10-23", "2026-12-20", SUN)).toMatch(/passou/);
    expect(validateSearchStartDate("2026-12-21", "2026-12-21", SUN)).toMatch(/antes da data do evento/);
    expect(validateSearchStartDate("2026-12-22", "2026-12-21", SUN)).toMatch(/antes da data do evento/);
    expect(validateSearchStartDate("26/10/2026", "2026-12-21", SUN)).toMatch(/válida/);
  });
});

describe("parseSearchStartInput", () => {
  it("padrão / asap → null", () => {
    expect(parseSearchStartInput(null, null, "2026-12-20", SUN)).toEqual({ ok: true, value: null });
    expect(parseSearchStartInput("asap", "2026-10-31", "2026-12-20", SUN)).toEqual({ ok: true, value: null });
  });
  it("modo data valida no servidor (fim de semana burlando o seletor é recusado)", () => {
    expect(parseSearchStartInput("date", "2026-10-31", "2026-12-20", SUN).ok).toBe(false);
    expect(parseSearchStartInput("date", "2026-11-04", "2026-12-20", SUN)).toEqual({ ok: true, value: "2026-11-04" });
    expect(parseSearchStartInput("hack", "", "2026-12-20", SUN).ok).toBe(false);
  });
});

describe("searchStartInstant", () => {
  it("sem data → próxima janela útil 9h (segunda)", () => {
    expect(searchStartInstant(SUN, null).toISOString()).toBe("2026-10-26T12:00:00.000Z");
  });
  it("data futura → 9h de Brasília daquele dia", () => {
    expect(searchStartInstant(SUN, "2026-11-04").toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(msUntilSearchStart(SUN, "2026-11-04")).toBe(Date.parse("2026-11-04T12:00:00Z") - SUN.getTime());
  });
  it("data de hoje em horário comercial → já", () => {
    const now = new Date("2026-10-26T15:00:00Z");
    expect(msUntilSearchStart(now, "2026-10-26")).toBe(0);
  });
  it("nunca antes de 9h (regra dura)", () => {
    const now = new Date("2026-10-26T11:30:00Z"); // 08h30 SP
    expect(searchStartInstant(now, "2026-10-26").toISOString()).toBe("2026-10-26T12:00:00.000Z");
  });
});

describe("canEditSearchStart / spDateKey", () => {
  it("editável só antes da busca começar", () => {
    expect(canEditSearchStart({ discovery_started_at: null, quotes_delivered_at: null })).toBe(true);
    expect(canEditSearchStart({ discovery_started_at: "2026-10-26T12:00:00Z", quotes_delivered_at: null })).toBe(false);
  });
  it("dia em SP", () => {
    expect(spDateKey(new Date("2026-10-26T02:00:00Z"))).toBe("2026-10-25");
  });
});

describe("aviso reflete a data agendada", () => {
  it("menciona a data e conta 2 dias úteis a partir dela", () => {
    const c = quotePreparingCopy(SUN, "2026-11-04");
    expect(c.detail).toContain("Busca agendada");
    expect(c.detail).toContain("quarta, 04/11");
    expect(c.headline).toContain("até sexta, 06/11");
  });
});
