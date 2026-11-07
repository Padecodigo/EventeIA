import { describe, expect, it } from "vitest";

import { centsToCsv, csvCell, toCsv } from "@/lib/export/csv";
import { scenarioCsv, scenarioLines } from "@/lib/quotes/export";
import { buildEventScenarios, toSnapshotRows, type QuotationRowForScenario } from "@/lib/quotes/scenarios";

const row = (id: string, category: string, amount: number, name: string): QuotationRowForScenario => ({
  id, category, vendor_name: name, vendor_contact: "+5511988887777", amount_cents: amount,
  fees_cents: 0, confidence: 0.9, needs_followup: false, extraction: { fees: [] },
});

describe("fase 5 — exportação", () => {
  it("csv: centavos, aspas, ; e injeção de fórmula", () => {
    expect(centsToCsv(123456)).toBe("1234,56");
    expect(centsToCsv(-5)).toBe("-0,05");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(-3)).toBe("-3");
    expect(toCsv(["a"], [["x"]])).toBe("\uFEFFa\r\nx\r\n");
  });

  it("linhas e CSV do orçamento com contatos e total", () => {
    const rows = [row("a", "buffet", 300000, "Buffet; Sol"), row("b", "doces", 50000, "Doce")];
    const snap = toSnapshotRows("e", "v1", buildEventScenarios([{ category: "buffet" }, { category: "doces" }], rows), rows)[0]?.breakdown;
    if (!snap) throw new Error("sem snapshot");
    expect(scenarioLines(snap)).toHaveLength(2);
    const csv = scenarioCsv(snap);
    expect(csv.split("\n")[0]).toContain("orcamento;fornecedor");
    expect(csv).toContain('"Buffet; Sol"');
    expect(csv).toContain("+5511988887777");
    expect(csv).toContain("Melhor preço;TOTAL;;;3500,00");
  });

  it("CSV não promete menor preço quando falta cotação válida", () => {
    const rows = [row("a", "buffet", 300000, "Buffet Sol")];
    const snap = toSnapshotRows(
      "e",
      "v1",
      buildEventScenarios([{ category: "buffet" }, { category: "doces" }], rows),
      rows,
    )[0]?.breakdown;
    if (!snap) throw new Error("sem snapshot");
    const csv = scenarioCsv(snap);
    expect(csv).toContain("Orçamento incompleto;TOTAL PARCIAL");
    expect(csv).toContain("não é possível confirmar o menor preço");
  });
});
