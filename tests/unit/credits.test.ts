import { describe, expect, it } from "vitest";

import { currentBalanceCents, expiredRemainingCents } from "@/lib/credits";

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

describe("expiração de franquia (FIFO)", () => {
  it("expira o restante quando há créditos posteriores", () => {
    // saldo 7, franquia posterior de 5 ⇒ restante da atual = 2
    expect(expiredRemainingCents(700, 500)).toBe(200);
  });

  it("não expira nada quando a franquia já foi consumida", () => {
    // franquia de 10 consumida; saldo 8 vem de créditos posteriores (10)
    expect(expiredRemainingCents(800, 1000)).toBe(0);
  });

  it("saldo zerado não gera expiração", () => {
    expect(expiredRemainingCents(0, 500)).toBe(0);
    expect(expiredRemainingCents(-100, 0)).toBe(0);
  });

  it("sem créditos posteriores, expira todo o saldo", () => {
    expect(expiredRemainingCents(700, 0)).toBe(700);
  });
});
