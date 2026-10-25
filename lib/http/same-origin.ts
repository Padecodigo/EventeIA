/**
 * Checagem same-origin (anti-CSRF) que funciona atrás do proxy (Traefik/Coolify).
 *
 * Regressão: comparava `Origin` com `request.nextUrl.origin`, que atrás do proxy é a
 * origem interna do container — todo POST legítimo do navegador recebia 403
 * (/api/boas-vindas e /api/cupom-sorte nunca emitiam a oferta/cupom).
 */
export interface OriginContext {
  origin: string | null;
  host: string | null;
  forwardedHost: string | null;
  appUrl: string | undefined;
  /** URL vista pelo servidor (nextUrl) — vale fora do proxy (dev/testes). */
  requestUrl?: string;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function isSameOrigin(ctx: OriginContext): boolean {
  if (ctx.origin === null) return true; // navegação/same-origin sem cabeçalho Origin
  const originHost = hostOf(ctx.origin);
  if (originHost === null) return false;
  const allowed = new Set<string>();
  const fwd = ctx.forwardedHost?.split(",")[0]?.trim().toLowerCase();
  if (fwd) allowed.add(fwd);
  if (ctx.host) allowed.add(ctx.host.toLowerCase());
  const app = ctx.appUrl ? hostOf(ctx.appUrl) : null;
  if (app) allowed.add(app);
  const own = ctx.requestUrl ? hostOf(ctx.requestUrl) : null;
  if (own) allowed.add(own);
  return allowed.has(originHost);
}

export function requestIsSameOrigin(request: { headers: Headers; url: string }): boolean {
  return isSameOrigin({
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    requestUrl: request.url,
  });
}
