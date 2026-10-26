import { describe, expect, it } from "vitest";

import { formatBRL } from "@/lib/money";
import {
  formatOptionPrice,
  parseQuotationOptions,
  renderChoiceMessage,
  resolveChoiceOption,
} from "@/lib/quotes/choices";
import { nuancedQuotationSchema } from "@/lib/schemas/quotation-extraction";

const options = [
  { name: "Pacote prata", amount_cents: 450000, includes: ["buffet", "louça"] },
  { name: "Pacote ouro", description: "inclui decoração", amount_cents: 650000 },
];

describe("opções do fornecedor", () => {
  it("lê opções de extraction.quotation.options", () => {
    const parsed = parseQuotationOptions({ quotation: { options } });
    expect(parsed.map((o) => o.name)).toEqual(["Pacote prata", "Pacote ouro"]);
    expect(parsed[0]?.amount_cents).toBe(450000);
  });

  it("tolera formatos antigos, vazios e inválidos", () => {
    expect(parseQuotationOptions(null)).toEqual([]);
    expect(parseQuotationOptions({ quotation: {} })).toEqual([]);
    expect(parseQuotationOptions({ quotation: { options: [{ name: "" }] } })).toEqual([]);
    expect(parseQuotationOptions({ options })).toHaveLength(2);
  });

  it("resolve índice válido e rejeita fora do intervalo", () => {
    expect(resolveChoiceOption(options, 1)?.name).toBe("Pacote ouro");
    expect(resolveChoiceOption(options, -1)).toBeNull();
    expect(resolveChoiceOption(options, 5)).toBeNull();
    expect(resolveChoiceOption(options, 1.5)).toBeNull();
  });

  it("formata preço (a combinar quando null)", () => {
    expect(formatOptionPrice(options[0]!)).toBe(formatBRL(450000));
    expect(formatOptionPrice({ name: "X", amount_cents: null })).toBe("a combinar");
  });

  it("mensagem ao fornecedor é humana e sem rodapé de bot", () => {
    const msg = renderChoiceMessage({
      vendorName: "Buffet Sabor",
      eventTitle: "Festa da Lia",
      option: options[1]!,
    });
    expect(msg).toContain("Buffet Sabor");
    expect(msg).toContain("Pacote ouro");
    expect(msg).toContain("6.500,00");
    expect(msg).toContain("Festa da Lia");
    expect(msg).not.toContain("SAIR");
    expect(msg).not.toMatch(/https?:\/\//);
  });

  it("schema antigo (sem options) continua válido com []", () => {
    const parsed = nuancedQuotationSchema.parse({
      total_price_cents: 1000,
      base_price_cents: null,
      mandatory_fees: [],
      item_breakdown: [],
      validity_days: null,
      payment_conditions: null,
      confidence_score: 0.9,
    });
    expect(parsed.options).toEqual([]);
  });
});
