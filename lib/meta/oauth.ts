/**
 * Constantes e helpers puros do fluxo OAuth do Facebook Login for Business.
 * Sem "server-only": pode ser importado por testes e por componentes de cliente.
 */

/**
 * Escopos do Facebook Login for Business.
 * `business_management` NÃO é incluído: foi removido do pedido de App Review e o
 * código não usa a API do Business Manager.
 */
export const META_LOGIN_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "instagram_content_publish",
] as const;

export const META_STATE_COOKIE = "meta_oauth_state";

/** Caminho restrito ao fluxo /meta/* (o cookie não vaza para outras rotas). */
export const META_OAUTH_COOKIE_PATH = "/meta";

/** TTL curto (10 min) para limitar a janela de um ataque de fixação de state. */
export const META_OAUTH_TTL_SECONDS = 600;

export function metaOauthCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    // Secure em produção; em dev (http://localhost) um cookie Secure nunca retornaria.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: META_OAUTH_COOKIE_PATH,
    maxAge: META_OAUTH_TTL_SECONDS,
  };
}

export interface BuildMetaAuthorizeUrlInput {
  appId: string;
  redirectUri: string;
  state: string;
  apiVersion: string;
  configId?: string | null;
}

/** Monta a URL do diálogo OAuth. Com config_id definido, o scope é omitido. */
export function buildMetaAuthorizeUrl(input: BuildMetaAuthorizeUrlInput): string {
  const url = new URL(`https://www.facebook.com/${input.apiVersion}/dialog/oauth`);
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", "code");

  const configId = input.configId?.trim();
  if (configId !== undefined && configId.length > 0) {
    url.searchParams.set("config_id", configId);
  } else {
    url.searchParams.set("scope", META_LOGIN_SCOPES.join(","));
  }
  return url.toString();
}

/**
 * Extrai os escopos concedidos de `/me/permissions` ({data:[{permission,status}]}).
 * Tolerante a payload inválido: retorna [] em vez de lançar.
 */
export function parseGrantedScopes(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const granted: string[] = [];
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) continue;
    const permission = (entry as { permission?: unknown }).permission;
    const status = (entry as { status?: unknown }).status;
    if (typeof permission === "string" && status === "granted") {
      granted.push(permission);
    }
  }
  return granted;
}
