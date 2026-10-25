export interface LedgerEntryLike {
  balance_after_cents: number;
}

/**
 * Saldo atual do workspace: `balance_after_cents` do lançamento mais recente
 * (entradas ordenadas por created_at desc).
 *
 * Regressão guardada: somar apenas uma janela de lançamentos (ex.: últimos 30)
 * daria saldo errado — o saldo é sempre o último estado, nunca uma soma parcial.
 */
export function currentBalanceCents(entries: readonly LedgerEntryLike[]): number {
  return entries[0]?.balance_after_cents ?? 0;
}
