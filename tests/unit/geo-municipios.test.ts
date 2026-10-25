import { describe, expect, it } from "vitest";

import { findMunicipioByCode, municipioCount, normalizeText, regionForUf, searchMunicipios } from "@/lib/geo/municipios";

describe("municípios IBGE", () => {
  it("snapshot cobre todo o Brasil", () => {
    expect(municipioCount()).toBeGreaterThan(5500);
    expect(findMunicipioByCode(3550308)).toEqual({ code: 3550308, name: "São Paulo", uf: "SP" });
    expect(findMunicipioByCode(1)).toBeNull();
  });

  it("normaliza acentos e caixa", () => {
    expect(normalizeText("  São JOSÉ dos   Campos ")).toBe("sao jose dos campos");
  });

  it("busca sem acento, com prefixo primeiro", () => {
    const r = searchMunicipios("sao jose dos campos");
    expect(r[0]).toMatchObject({ name: "São José dos Campos", uf: "SP" });
    expect(searchMunicipios("goiania")[0]?.name).toBe("Goiânia");
    expect(searchMunicipios("a")).toEqual([]);
  });

  it("filtra por UF ('cidade, UF')", () => {
    const r = searchMunicipios("santa maria, RS");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => m.uf === "RS")).toBe(true);
    expect(r[0]?.name).toBe("Santa Maria");
  });

  it("limita resultados", () => {
    expect(searchMunicipios("santa", 5)).toHaveLength(5);
  });

  it("mapeia UF → faixa regional do motor", () => {
    expect(regionForUf("SP")).toBe("sp");
    expect(regionForUf("rj")).toBe("rj");
    expect(regionForUf("MG")).toBe("mg");
    expect(regionForUf("BA")).toBe("outros");
  });
});
