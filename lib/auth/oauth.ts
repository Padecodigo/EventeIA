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

/** Cookie com o destino pós-callback do link "Esqueci minha senha". */
export const RESET_NEXT_COOKIE = "eventeia_auth_next";

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

const ORIGIN_ENV_KEYS = [
  "APP_URL",
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
] as const;

function isBindHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return h === "0.0.0.0" || h === "[::]" || h === "::" || h.length === 0;
}

function toOrigin(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isBindHost(u.host)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Origem pública do app para montar redirects no servidor.
 * Atrás do Traefik/Cloudflare o request.url do container standalone aponta
 * para o bind host (0.0.0.0:3000) — nunca usá-lo. Ordem: env configurada
 * (lida em runtime) > x-forwarded-host/proto > host > origem do request.
 */
export function publicOrigin(
  headers: Pick<Headers, "get">,
  requestUrl: string,
  env: Record<string, string | undefined> = process.env,
): string {
  for (const key of ORIGIN_ENV_KEYS) {
    const o = toOrigin(env[key]);
    if (o !== null) return o;
  }
  const req = new URL(requestUrl);
  const fwdHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fwdProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    fwdProto === "http" || fwdProto === "https" ? fwdProto : req.protocol.replace(":", "");
  for (const host of [fwdHost, headers.get("host")?.trim()]) {
    if (host && /^[a-z0-9.\-:[\]]+$/i.test(host)) {
      const o = toOrigin(`${proto}://${host}`);
      if (o !== null) return o;
    }
  }
  return req.origin;
}
