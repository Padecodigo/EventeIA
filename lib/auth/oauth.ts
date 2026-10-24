/**
 * Utilitários puros do login social (Google via Supabase Auth OAuth).
 * Sem dependências de servidor — testáveis em unidade.
 */

/** Só aceita caminhos internos (evita open redirect via ?next=). */
export function safeNextPath(next: string | null | undefined, fallback = "/painel"): string {
  if (typeof next !== "string" || next.length === 0) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}

/** URL do callback OAuth, sempre na origem do app. */
export function buildCallbackUrl(origin: string, next?: string | null): string {
  const url = new URL("/auth/callback", origin);
  const path = safeNextPath(next);
  if (path !== "/painel") url.searchParams.set("next", path);
  return url.toString();
}

export function oauthErrorMessage(code: string | null | undefined): string | undefined {
  if (code === null || code === undefined || code.length === 0) return undefined;
  if (code === "access_denied") return "Login com Google cancelado.";
  return "Não foi possível entrar com o Google. Tente novamente ou use e-mail e senha.";
}
