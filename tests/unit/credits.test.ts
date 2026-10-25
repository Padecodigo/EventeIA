import { describe, expect, it } from "vitest";

import { currentBalanceCents } from "@/lib/credits";

describe("saldo de créditos do workspace", () => {
  it("retorna 0 sem lançamentos", () => {
    expect(currentBalanceCents([])).toBe(0);
  });

  it("usa o saldo_after do lançamento mais recente (ordem desc por data)", () => {
    const entries = [{ balance_after_cents: 300 }, { balance_after_cents: 1200 }];
    expect(currentBalanceCents(entries)).toBe(300);
  });

  it("não soma a janela — soma parcial daria saldo errado (regressão)", () => {
    // Soma daria 1700; o saldo real é o último estado: 100.
    const entries = [
      { balance_after_cents: 100 },
      { balance_after_cents: 900 },
      { balance_after_cents: 700 },
    ];
    expect(currentBalanceCents(entries)).toBe(100);
  });
});
