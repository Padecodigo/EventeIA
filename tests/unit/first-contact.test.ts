import { describe, expect, it } from "vitest";

import { firstContactMessageSchema } from "@/lib/schemas/whatsapp";
import { SURVEY_SENTENCE, buildFirstContactText, greetingFor } from "@/lib/whatsapp/first-contact";

// SP = UTC-3
const at = (hhSp: number, mm = 0) => new Date(Date.UTC(2026, 9, 24, hhSp + 3, mm));

describe("greetingFor (America/Sao_Paulo)", () => {
  it.each([
    [5, "Bom dia"],
    [8, "Bom dia"],
    [11, "Bom dia"],
    [12, "Boa tarde"],
    [15, "Boa tarde"],
    [17, "Boa tarde"],
    [18, "Boa noite"],
    [22, "Boa noite"],
    [0, "Boa noite"],
    [4, "Boa noite"],
  ])("%ih → %s", (h, g) => {
    expect(greetingFor(at(h))).toBe(g);
  });
  it("respeita borda 11:59 / 17:59", () => {
    expect(greetingFor(at(11, 59))).toBe("Bom dia");
    expect(greetingFor(at(17, 59))).toBe("Boa tarde");
  });
  it("usa o fuso de SP, não UTC (14h UTC = 11h SP)", () => {
    expect(greetingFor(new Date("2026-10-24T14:00:00Z"))).toBe("Bom dia");
  });
});

const base = {
  quoteSubject: "buffet",
  eventTypeLabel: "Casamento",
  eventDateIso: "2026-12-12",
  city: "Campinas",
  guestCount: 120,
};

describe("buildFirstContactText", () => {
  const seeds = [
    "Buffet Sabor",
    "Doces da Ana",
    "DJ Max",
    "Foto Luz",
    "Espaço Verde",
    "X",
    "Y Eventos",
  ];
  it.each(seeds)("mantém a estrutura obrigatória (seed %s)", (seed) => {
    const text = buildFirstContactText({ ...base, now: at(9), seed });
    expect(text).toMatch(/^Bom dia, tudo bem\? Aqui é da EventeIA\. /);
    expect(text).toMatch(/orçamento de buffet\./);
    expect(text).toMatch(/um casamento para 120 convidados em Campinas no dia 12\/12\/2026\./);
    expect(text).toMatch(/o que você fornece/);
    expect(text).toMatch(/fornec/);
    expect(text).toMatch(/como funciona o serviço/);
    expect(text).toMatch(/valores e prazos/);
    expect(text).toMatch(/por favor\?/);
    expect(text.endsWith(SURVEY_SENTENCE)).toBe(true);
    expect(firstContactMessageSchema.safeParse(text).success).toBe(true);
  });
  it("varia o texto entre fornecedores (anti-ban)", () => {
    const texts = new Set(
      seeds.map((seed) => buildFirstContactText({ ...base, now: at(9), seed })),
    );
    expect(texts.size).toBeGreaterThan(1);
  });
  it("é determinístico para a mesma seed", () => {
    expect(buildFirstContactText({ ...base, now: at(9), seed: "A" })).toBe(
      buildFirstContactText({ ...base, now: at(9), seed: "A" }),
    );
  });
  it("usa 'uma' para festa e inclui detalhes sem URL", () => {
    const text = buildFirstContactText({
      ...base,
      eventTypeLabel: "Festa infantil",
      details: "Tema safari www.x.com",
      now: at(20),
      seed: "s",
    });
    expect(text).toMatch(/^Boa noite/);
    expect(text).toContain("uma festa infantil");
    expect(text).toContain("Tema safari");
    expect(text).not.toMatch(/www\./);
  });
  it("omite cidade vazia sem espaços duplos", () => {
    const text = buildFirstContactText({ ...base, city: "", now: at(14), seed: "s" });
    expect(text).not.toMatch(/ {2}| em  /);
    expect(text).toContain("120 convidados no dia");
  });
});
