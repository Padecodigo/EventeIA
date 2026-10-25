/** Sem dependências de Node: seguro para componentes client. */
const pad = (n: number): string => String(n).padStart(2, "0");

/** hh:mm:ss a partir de milissegundos restantes (nunca negativo). */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** dd:hh:mm:ss a partir de milissegundos restantes (nunca negativo). */
export function formatCountdownDays(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  return `${pad(Math.floor(total / 86_400))}:${pad(Math.floor((total % 86_400) / 3600))}:${pad(
    Math.floor((total % 3600) / 60),
  )}:${pad(total % 60)}`;
}
