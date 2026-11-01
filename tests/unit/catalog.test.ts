import { describe, expect, it } from "vitest";

import {
  defaultAnswers,
  parseAnswers,
  requiredCategories,
  resolveRequirements,
  validateCatalog,
  visibleQuestions,
} from "@/lib/catalog/rules";
import {
  ALL_EVENT_TYPES,
  CATEGORY_LABELS,
  EVENT_TYPE_LABELS,
  ITEMS,
  SPACE_TYPES,
  SUPPLIER_INCLUI_COVERS,
  SUPPLIER_INCLUI_LABELS,
  SUPPLIER_INCLUI_TAGS,
  VALE_DO_PARAIBA_CITIES,
  normalizeCategoryCode,
  normalizeSupplierIncluiTag,
} from "@/lib/catalog/v1";

describe("catálogo v1", () => {
  it("é íntegro (códigos únicos, condições válidas, overrides válidos)", () => {
    expect(validateCatalog()).toEqual([]);
  });

  it("cobre todos os tipos de evento com rótulo, incluindo Corporativo", () => {
    expect(ALL_EVENT_TYPES).toHaveLength(7);
    expect(EVENT_TYPE_LABELS.corporativo).toMatch(/^Corporativo/);
  });

  it("tem categorias das nuances (limpeza, transporte, segurança, cerimonial, garçons, louça, gerador, recreação)", () => {
    const cats = new Set(ITEMS.map((i) => i.category));
    for (const c of [
      "limpeza",
      "transporte",
      "seguranca",
      "cerimonial",
      "garcons",
      "louca",
      "gerador",
      "recreacao",
    ] as const) {
      expect(cats.has(c)).toBe(true);
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });

  it("lista cidades do Vale do Paraíba", () => {
    expect(VALE_DO_PARAIBA_CITIES).toContain("São José dos Campos");
    expect(VALE_DO_PARAIBA_CITIES).toContain("Taubaté");
  });

  it("respostas padrão de todos os tipos passam na validação", () => {
    for (const t of ALL_EVENT_TYPES) {
      const parsed = parseAnswers(t, defaultAnswers(t));
      expect(parsed.success).toBe(true);
      const reqs = resolveRequirements(t, 100, parsed.success ? parsed.data : {});
      expect(requiredCategories(reqs)).toEqual(
        expect.arrayContaining(["buffet", "decoracao", "bebidas"]),
      );
    }
  });
});

describe("regras condicionais", () => {
  it("energia só é perguntada em ambiente aberto; gerador só sem energia", () => {
    const base = defaultAnswers("casamento");
    expect(visibleQuestions("casamento", base).some((q) => q.id === "energia_no_local")).toBe(
      false,
    );
    const aberto = { ...base, ambiente: "aberto", energia_no_local: false };
    expect(visibleQuestions("casamento", aberto).some((q) => q.id === "energia_no_local")).toBe(
      true,
    );
    const codes = resolveRequirements("casamento", 100, aberto).map((r) => r.itemCode);
    expect(codes).toContain("gerador_energia");
    const comEnergia = resolveRequirements("casamento", 100, { ...aberto, energia_no_local: true });
    expect(comEnergia.map((r) => r.itemCode)).not.toContain("gerador_energia");
  });

  it("espaço só entra quando não há local próprio", () => {
    const a = defaultAnswers("festa_infantil");
    expect(
      resolveRequirements("festa_infantil", 50, { ...a, local_proprio: false }).map(
        (r) => r.itemCode,
      ),
    ).toContain("espaco_locacao");
    expect(
      resolveRequirements("festa_infantil", 50, { ...a, local_proprio: true }).map(
        (r) => r.itemCode,
      ),
    ).not.toContain("espaco_locacao");
  });

  it("recreação não é oferecida em corporativo; padrão ligado em festa infantil", () => {
    expect(
      visibleQuestions("corporativo", defaultAnswers("corporativo")).some(
        (q) => q.id === "recreacao",
      ),
    ).toBe(false);
    expect(defaultAnswers("festa_infantil").recreacao).toBe(true);
    const reqs = resolveRequirements("corporativo", 80, {
      ...defaultAnswers("corporativo"),
      recreacao: true,
    });
    expect(reqs.map((r) => r.category)).not.toContain("recreacao");
  });

  it("bar terceirizado depende de bebida alcoólica", () => {
    const a = { ...defaultAnswers("aniversario"), bebida_alcoolica: false, bar_terceirizado: true };
    const parsed = parseAnswers("aniversario", a);
    expect(parsed.success && "bar_terceirizado" in parsed.data).toBe(false);
    expect(
      resolveRequirements("aniversario", 60, parsed.success ? parsed.data : {}).map(
        (r) => r.itemCode,
      ),
    ).not.toContain("bar_drinks");
  });

  it("quantidades: garçons 1/20, segurança 1/100, transporte pela resposta, horas pela duração", () => {
    const a = {
      ...defaultAnswers("casamento"),
      garcons: true,
      seguranca: true,
      transporte: true,
      transporte_pessoas: 35,
      horario_inicio: "18:00",
      horario_fim: "00:00",
      foto: "foto",
    };
    const byCode = new Map(
      resolveRequirements("casamento", 150, a).map((r) => [r.itemCode, r.quantity]),
    );
    expect(byCode.get("garcons_copeiras")).toBe(8);
    expect(byCode.get("seguranca_portaria")).toBe(2);
    expect(byCode.get("transporte_convidados")).toBe(35);
    expect(byCode.get("fotografia")).toBe(6);
    expect(byCode.get("buffet_jantar")).toBe(150);
  });

  it("rejeita valores fora do catálogo", () => {
    expect(parseAnswers("casamento", { horario_inicio: "25:00" }).success).toBe(false);
    expect(
      parseAnswers("casamento", { horario_inicio: "20:00", horario_fim: "20:00" }).success,
    ).toBe(false);
    expect(parseAnswers("casamento", { estilo_comida: "pizza" }).success).toBe(false);
    expect(parseAnswers("casamento", "não é objeto").success).toBe(false);
  });

  it("música 'ambos' gera DJ e banda sem duplicar categoria", () => {
    const reqs = resolveRequirements("casamento", 100, {
      ...defaultAnswers("casamento"),
      musica: "ambos",
    });
    const cats = reqs.map((r) => r.category);
    expect(cats).toContain("som_dj");
    expect(cats).toContain("banda");
    expect(new Set(reqs.map((r) => r.itemCode)).size).toBe(reqs.length);
  });
});

describe("pergunta aberta final (demanda específica)", () => {
  it("aparece por último em todas as entrevistas e é opcional", () => {
    for (const t of ALL_EVENT_TYPES) {
      const qs = visibleQuestions(t, defaultAnswers(t));
      expect(qs.at(-1)?.id).toBe("demanda_especifica");
      const parsed = parseAnswers(t, defaultAnswers(t));
      expect(parsed.success).toBe(true);
      const reqs = resolveRequirements(t, 50, parsed.success ? parsed.data : {});
      expect(reqs.map((r) => r.itemCode)).not.toContain("demanda_especifica");
    }
  });

  it("texto sem vírgula vira UM item livre (livre_*) com o texto do cliente", () => {
    const parsed = parseAnswers("corporativo", {
      ...defaultAnswers("corporativo"),
      demanda_especifica: "  Intérprete de Libras e tenda para chuva  ",
    });
    expect(parsed.success).toBe(true);
    const reqs = resolveRequirements("corporativo", 80, parsed.success ? parsed.data : {});
    const special = reqs.filter((r) => r.itemCode.startsWith("livre_"));
    expect(special).toHaveLength(1);
    expect(special[0]).toMatchObject({
      category: "outros",
      quantity: 1,
      mandatory: false,
      label: "Intérprete de Libras e tenda para chuva",
    });
    expect(special[0]?.notes).toBe("Intérprete de Libras e tenda para chuva");
  });

  it("rejeita texto acima de 500 caracteres", () => {
    const parsed = parseAnswers("casamento", {
      ...defaultAnswers("casamento"),
      demanda_especifica: "x".repeat(501),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("taxonomia de fornecedor e nuances de música/bar", () => {
  it("novas categorias têm rótulo e não se confundem com DJ", () => {
    for (const c of ["banda", "cantor_cerimonia", "barman"] as const) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
    expect(CATEGORY_LABELS.banda).not.toBe(CATEGORY_LABELS.som_dj);
    const cats = new Set(ITEMS.map((i) => i.category));
    expect(cats.has("banda")).toBe(true);
    expect(cats.has("cantor_cerimonia")).toBe(true);
    expect(cats.has("barman")).toBe(true);
  });

  it("banda e DJ usam categorias distintas; barman é categoria própria", () => {
    const comBanda = resolveRequirements("casamento", 100, {
      ...defaultAnswers("casamento"),
      musica: "ambos",
      bebida_alcoolica: true,
      bar_terceirizado: true,
    });
    const byCode = new Map(comBanda.map((r) => [r.itemCode, r.category]));
    expect(byCode.get("banda_combo")).toBe("banda");
    expect(byCode.get("dj_som_combo")).toBe("som_dj");
    expect(byCode.get("bar_drinks")).toBe("barman");
  });

  it("cantor de cerimônia só entra quando pedido, em casamento/batizado", () => {
    const sem = resolveRequirements("casamento", 100, defaultAnswers("casamento"));
    expect(sem.map((r) => r.itemCode)).not.toContain("cantor_cerimonia");
    const com = resolveRequirements("casamento", 100, {
      ...defaultAnswers("casamento"),
      cantor_cerimonia: true,
    });
    expect(com.find((r) => r.itemCode === "cantor_cerimonia")?.category).toBe("cantor_cerimonia");
    const corporativo = resolveRequirements("corporativo", 100, {
      ...defaultAnswers("corporativo"),
      cantor_cerimonia: true,
    });
    expect(corporativo.map((r) => r.itemCode)).not.toContain("cantor_cerimonia");
  });

  it("tags de 'inclui' normalizam sinônimos e apontam para a categoria certa", () => {
    for (const tag of SUPPLIER_INCLUI_TAGS) {
      expect(SUPPLIER_INCLUI_LABELS[tag]).toBeTruthy();
    }
    expect(normalizeSupplierIncluiTag("Garçons")).toBe("servico");
    expect(normalizeSupplierIncluiTag("Louça e talheres")).toBe("louca");
    expect(normalizeSupplierIncluiTag("Bartender")).toBe("barman");
    expect(normalizeSupplierIncluiTag("Cantor de cerimônia")).toBe("cantor_cerimonia");
    expect(normalizeSupplierIncluiTag("desconhecido")).toBeNull();
    expect(SUPPLIER_INCLUI_COVERS.comida).toBe("buffet");
    expect(SUPPLIER_INCLUI_COVERS.banda).toBe("banda");
    expect(SUPPLIER_INCLUI_COVERS.som).toBe("som_dj");
    expect(SUPPLIER_INCLUI_COVERS.barman).toBe("barman");
  });

  it("categorias legadas continuam apontando para a taxonomia atual", () => {
    expect(normalizeCategoryCode("musica_ao_vivo")).toBe("banda");
    expect(normalizeCategoryCode("Música ao Vivo")).toBe("banda");
    expect(normalizeCategoryCode("bartender")).toBe("barman");
    expect(normalizeCategoryCode("cantor")).toBe("cantor_cerimonia");
    expect(normalizeCategoryCode("buffet")).toBe("buffet");
    expect(normalizeCategoryCode("desconhecida")).toBeNull();
  });

  it("espaço tem tipos canônicos para a tag de capacidade", () => {
    expect(SPACE_TYPES).toContain("chacara");
    expect(SPACE_TYPES).toContain("salao");
  });
});
