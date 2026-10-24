import { describe, expect, it } from "vitest";

import { CATEGORY_LABELS, type CategoryCode } from "@/lib/catalog/v1";
import { firstContactMessageSchema } from "@/lib/schemas/whatsapp";
import {
  CATEGORY_ASKS,
  CATEGORY_SCOPE,
  SURVEY_SENTENCE,
  buildFirstContactText,
  categoryAsk,
  categoryScope,
  greetingFor,
} from "@/lib/whatsapp/first-contact";

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

describe("perguntas específicas por categoria", () => {
  const codes = Object.keys(CATEGORY_LABELS) as CategoryCode[];
  it("toda categoria do catálogo tem pergunta própria", () => {
    for (const c of codes) expect(CATEGORY_ASKS[c].length).toBeGreaterThan(10);
    expect(new Set(codes.map((c) => CATEGORY_ASKS[c])).size).toBe(codes.length);
  });
  it.each(codes)("%s: mensagem completa com pergunta da categoria", (code) => {
    for (const seed of ["a", "b", "c"]) {
      const text = buildFirstContactText({
        ...base,
        quoteSubject: CATEGORY_LABELS[code].toLowerCase(),
        category: code,
        now: at(15),
        seed,
      });
      expect(text).toMatch(/^Boa tarde, tudo bem\? Aqui é da EventeIA\. /);
      expect(text).toContain(CATEGORY_ASKS[code]);
      expect(text).toContain(CATEGORY_SCOPE[code]);
      expect(text).toMatch(/o que está incluso e o que (não está|fica à parte)/);
      expect(text).toMatch(/o que você fornece.*como funciona o serviço.*valores e prazos/);
      expect(text.endsWith(SURVEY_SENTENCE)).toBe(true);
      expect(firstContactMessageSchema.safeParse(text).success).toBe(true);
    }
  });
  it.each([
    ["decoracao", /tema.*montagem e a desmontagem/],
    ["mobiliario", /quantidades e os modelos.*entrega e do recolhimento/],
    ["espaco", /capacidade.*horários.*incluso/],
    ["som_dj", /repertório.*duração.*equipamento de som/],
    ["musica_ao_vivo", /repertório.*duração.*equipamento de som/],
    ["buffet", /cardápio.*valor por pessoa.*equipe/],
  ])("%s pede os pontos combinados", (code, re) => {
    expect(categoryAsk(code)).toMatch(re);
  });
  it("categoria desconhecida usa fallback genérico", () => {
    const text = buildFirstContactText({
      ...base,
      quoteSubject: "pula-pula",
      category: "xyz",
      now: at(15),
      seed: "a",
    });
    expect(text).toContain("o que está incluso e como é feita a entrega ou a execução");
    expect(categoryAsk(undefined)).toBe(categoryAsk("xyz"));
  });
});

describe("checklist de escopo (inclui / não inclui)", () => {
  it("buffet pergunta mão de obra, louça e lavagem; espaço pergunta mesas e limpeza", () => {
    expect(categoryScope("buffet")).toMatch(/mão de obra.*louça.*lavagem/);
    expect(categoryScope("espaco")).toMatch(/mesas.*limpeza/);
    expect(categoryScope("mobiliario")).toMatch(/entrega.*recolhimento/);
    expect(categoryScope("zzz")).toMatch(/entrega e retirada/);
  });
});
