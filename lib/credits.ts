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

/**
 * Restante de uma franquia que expira, dado o saldo atual do workspace e o
 * total de créditos ativos que vencem DEPOIS dela (top-ups nunca expiram ⇒
 * contam como "depois" e são consumidos por último — FIFO).
 *
 * Se a franquia já foi consumida, o resultado é 0 (nada a expirar).
 */
export function expiredRemainingCents(balanceCents: number, laterActiveCents: number): number {
  if (balanceCents <= 0) {
    return 0;
  }
  return Math.max(0, balanceCents - laterActiveCents);
}
