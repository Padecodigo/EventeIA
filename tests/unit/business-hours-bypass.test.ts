import { describe, expect, it } from "vitest";

import { isBusinessHoursBypassed, msUntilSearchStart } from "@/lib/search-start";

const LISTED = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("isBusinessHoursBypassed", () => {
  it("libera um evento presente na lista", () => {
    expect(isBusinessHoursBypassed(LISTED, LISTED)).toBe(true);
  });

  it("não libera um evento fora da lista", () => {
    expect(isBusinessHoursBypassed(OTHER, LISTED)).toBe(false);
  });

  it("lista vazia ou ausente não libera ninguém", () => {
    expect(isBusinessHoursBypassed(LISTED, "")).toBe(false);
    expect(isBusinessHoursBypassed(LISTED, undefined)).toBe(false);
  });

  it("ignora espaços em volta de cada item", () => {
    const raw = `  ${OTHER} , ${LISTED}  ,  `;
    expect(isBusinessHoursBypassed(LISTED, raw)).toBe(true);
    expect(isBusinessHoursBypassed(OTHER, raw)).toBe(true);
  });

  it("não faz correspondência parcial", () => {
    expect(isBusinessHoursBypassed(LISTED, LISTED.slice(0, 8))).toBe(false);
  });
});

describe("regressão: sem bypass, sábado ainda atrasa", () => {
  it("msUntilSearchStart continua adiando para o próximo dia útil", () => {
    const saturday = new Date("2026-10-31T13:00:00Z"); // sábado 10h SP
    const wait = msUntilSearchStart(saturday, null);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBe(Date.parse("2026-11-03T12:00:00Z") - saturday.getTime());
  });
});
