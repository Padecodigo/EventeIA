/**
 * TTL da sessão: limite curto para reduzir o "continuo logado" mesmo quando o
 * navegador restaura cookies de sessão ao reabrir.
 */

export const SESSION_COOKIE = "ev_session_started";
export const SESSION_MAX_AGE_MINUTES_DEFAULT = 120;

/** Validade efetiva (ms); configurável por `SESSION_MAX_AGE_MINUTES`. */
export function sessionMaxAgeMs(): number {
  const raw = Number(process.env.SESSION_MAX_AGE_MINUTES ?? String(SESSION_MAX_AGE_MINUTES_DEFAULT));
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : SESSION_MAX_AGE_MINUTES_DEFAULT;
  return minutes * 60_000;
}

/** Cookie de sessão (sem maxAge: some ao fechar o navegador quando o browser respeita). */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

/** `startedAt` em epoch ms (string do cookie); inválido conta como expirado. */
export function sessionExpired(
  startedAt: string | null | undefined,
  now: number,
  maxAgeMs: number = sessionMaxAgeMs(),
): boolean {
  if (startedAt === null || startedAt === undefined) return true;
  const started = Number(startedAt);
  if (!Number.isFinite(started) || started <= 0) return true;
  return now - started >= maxAgeMs;
}

/** Cookies do Supabase (`sb-...`) que compõem a sessão. */
export function isSessionCookie(name: string): boolean {
  return name.startsWith("sb-");
}
