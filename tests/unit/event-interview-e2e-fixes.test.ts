import { describe, expect, it } from "vitest";

import {
  defaultAnswers,
  interviewWarnings,
  parseAnswers,
  resolveRequirements,
  validateCatalog,
  visibleQuestions,
} from "@/lib/catalog/rules";
import {
  EVENT_STYLES,
  EVENT_STYLE_LABELS,
  SPACE_TYPES,
  venueCapacityWarning,
} from "@/lib/catalog/v1";

describe("correções E2E da entrevista", () => {
  it("aniversário de adulto começa com recreação desligada; de criança liga", () => {
    expect(defaultAnswers("aniversario").aniversario_publico).toBe("adulto");
    expect(defaultAnswers("aniversario").recreacao).toBe(false);

    const adulto = parseAnswers("aniversario", defaultAnswers("aniversario"));
    expect(adulto.success).toBe(true);
    expect(
      resolveRequirements("aniversario", 40, adulto.success ? adulto.data : {}).map(
        (r) => r.itemCode,
      ),
    ).not.toContain("recreacao_monitores");

    const crianca = parseAnswers("aniversario", {
      ...defaultAnswers("aniversario"),
      aniversario_publico: "crianca",
      recreacao: true,
    });
    expect(crianca.success).toBe(true);
    expect(
      resolveRequirements("aniversario", 40, crianca.success ? crianca.data : {}).map(
        (r) => r.category,
      ),
    ).toContain("recreacao");
  });

  it("buffet 'só comida' avisa e adiciona garçons e louça automaticamente", () => {
    const answers = {
      ...defaultAnswers("casamento"),
      buffet_inclui: "so_comida" as const,
      garcons: false,
      louca: false,
    };
    expect(interviewWarnings(answers)).toContain(
      "Buffet só com comida: garçons/copeiras e louça entram automaticamente como itens à parte.",
    );
    const codes = resolveRequirements("casamento", 100, answers).map((r) => r.itemCode);
    expect(codes).toContain("garcons_copeiras");
    expect(codes).toContain("louca_talheres");
  });

  it("buffet completo não força garçons/louça quando o cliente dispensou", () => {
    const answers = {
      ...defaultAnswers("casamento"),
      buffet_inclui: "completo" as const,
      garcons: false,
      louca: false,
    };
    expect(interviewWarnings(answers)).toEqual([]);
    const codes = resolveRequirements("casamento", 100, answers).map((r) => r.itemCode);
    expect(codes).not.toContain("garcons_copeiras");
    expect(codes).not.toContain("louca_talheres");
  });

  it("cantor de cerimônia/igreja e barman/bartender aparecem na entrevista e nas necessidades", () => {
    const casamento = { ...defaultAnswers("casamento"), bebida_alcoolica: true };
    const ids = visibleQuestions("casamento", casamento).map((q) => q.id);
    expect(ids).toContain("cantor_cerimonia");
    expect(ids).toContain("bar_terceirizado");

    const reqs = resolveRequirements("casamento", 100, {
      ...casamento,
      cantor_cerimonia: true,
      bar_terceirizado: true,
    });
    expect(reqs.find((r) => r.itemCode === "cantor_cerimonia")?.category).toBe("cantor_cerimonia");
    expect(reqs.find((r) => r.itemCode === "bar_drinks")?.category).toBe("barman");
  });

  it("estilos do evento têm rótulos em pt-BR e cobrem os tipos canônicos", () => {
    expect(EVENT_STYLES).toEqual([
      "rustico_chique",
      "classico",
      "moderno",
      "boho",
      "praia",
      "industrial",
      "outro",
    ]);
    expect(EVENT_STYLE_LABELS.rustico_chique).toBe("Rústico-chique");
    expect(EVENT_STYLE_LABELS.classico).toBe("Clássico");
    expect(SPACE_TYPES).toContain("chacara");
    expect(validateCatalog()).toEqual([]);
  });

  it("capacidade do local menor que os convidados gera aviso determinístico", () => {
    expect(venueCapacityWarning(80, 120)).toBe(
      "O local comporta até 80 convidados; o evento tem 120. Considere um espaço maior.",
    );
    expect(venueCapacityWarning(120, 120)).toBeNull();
    expect(venueCapacityWarning(null, 120)).toBeNull();
  });
});
