/**
 * Saúde do token da Meta — funções puras, sem I/O além do `fetchImpl` injetado.
 *
 * Um system user token consegue inspecionar a si mesmo via `debug_token`; o
 * token só é enviado na query string para `graph.facebook.com` e NUNCA é
 * logado (regra de segurança: segredos não vão para logs/feeds).
 */

const META_GRAPH_HOST = "graph.facebook.com";

/**
 * Escopos OBRIGATÓRIOS — a falta de qualquer um gera alerta (banner + e-mail).
 * Cada item cita o caminho de código que realmente chama a API e depende dele.
 */
export const REQUIRED_META_SCOPES = [
  // Leitura da conta IG: lib/meta/resolve.ts instagramHandleFromSid (GET /{igSid}?fields=username)
  // e a base do IG user para publicar (lib/meta/publishing.ts).
  "instagram_basic",
  // Publicação no feed do Instagram: lib/meta/publishing.ts createMediaContainer/publishContainer
  // (POST /{igUserId}/media e /media_publish) — usada por autopilot e posts de isca.
  "instagram_content_publish",
  // Respostas na DM do Instagram: lib/meta/client.ts sendInstagramText (POST /messages) e
  // lib/meta/publishing.ts sendPrivateReply (POST /messages).
  "instagram_manage_messages",
  // Private reply a comentário: lib/meta/publishing.ts sendPrivateReply (POST /messages com comment_id).
  "instagram_manage_comments",
  // Messenger/Página: acesso às páginas do token (META_PAGE_ID) — envio em
  // lib/meta/client.ts sendMessengerText depende da Página conectada ao token.
  "pages_show_list",
  // Engagement/leitura da Página: necessário para o webhook de mensagens do Messenger
  // (lib/meta/webhook.ts) e declarado nos fluxos facebookLogin (lib/meta/limits.ts).
  "pages_read_engagement",
  // Envio de mensagens via Messenger: lib/meta/client.ts sendMessengerText (POST /{pageId}/messages)
  // e o fluxo de resposta do job prospect-reply.
  "pages_messaging",
  // Token de system user atuando sobre ativos do negócio (Instagram Business + Página).
  "business_management",
] as const;

/**
 * Escopos OPCIONAIS/feature-gated — a falta gera aviso (âmbar) no painel, sem e-mail.
 */
export const OPTIONAL_META_SCOPES = [
  // Publicação na Página do Facebook (/{page-id}/feed ou /photos): o produto publica
  // via Instagram Graph API, não na Página — por isso é opcional. Sem ele, a
  // publicação na Página do Facebook falhará.
  "pages_manage_posts",
] as const;

export const META_OPTIONAL_SCOPE_NOTES: Record<string, string> = {
  pages_manage_posts: "publicação na Página do Facebook falhará sem ele",
};

export interface MetaTokenHealth {
  isValid: boolean;
  /** null quando `expires_at == 0` → "nunca expira". */
  expiresAt: string | null;
  dataAccessExpiresAt: string | null;
  scopes: string[];
  missingScopes: string[];
  optionalMissing: string[];
  type: string | null;
  appId: string | null;
  error?: string;
}

const toIsoOrNull = (raw: unknown): string | null => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
};

const toStringArray = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : [];

function empty(error?: string): MetaTokenHealth {
  return {
    isValid: false,
    expiresAt: null,
    dataAccessExpiresAt: null,
    scopes: [],
    missingScopes: [...REQUIRED_META_SCOPES],
    optionalMissing: [...OPTIONAL_META_SCOPES],
    type: null,
    appId: null,
    ...(error !== undefined ? { error } : {}),
  };
}

/**
 * Converte a resposta bruta de `GET /debug_token` em estado de saúde.
 * Lida com: token válido (inclusive `expires_at == 0` = nunca expira), token
 * inválido (`is_valid: false`) e erro da Graph API (`error` no topo do JSON).
 */
export function parseDebugToken(json: unknown): MetaTokenHealth {
  const root = json as
    | {
        data?: {
          is_valid?: unknown;
          expires_at?: unknown;
          data_access_expires_at?: unknown;
          scopes?: unknown;
          type?: unknown;
          app_id?: unknown;
        };
        error?: { message?: unknown; code?: unknown };
      }
    | null;

  if (root === null || typeof root !== "object") {
    return empty("resposta inválida da Graph API");
  }

  if (root.error !== undefined) {
    const message = typeof root.error.message === "string" ? root.error.message : "erro da Graph API";
    return empty(message);
  }

  const data = root.data;
  if (data === undefined || data === null || typeof data !== "object") {
    return empty("resposta sem data");
  }

  const scopes = toStringArray(data.scopes);
  const missingScopes = REQUIRED_META_SCOPES.filter((scope) => !scopes.includes(scope));
  const optionalMissing = OPTIONAL_META_SCOPES.filter((scope) => !scopes.includes(scope));

  return {
    isValid: data.is_valid === true,
    expiresAt: toIsoOrNull(data.expires_at),
    dataAccessExpiresAt: toIsoOrNull(data.data_access_expires_at),
    scopes,
    missingScopes,
    optionalMissing,
    type: typeof data.type === "string" ? data.type : null,
    appId: typeof data.app_id === "string" ? data.app_id : null,
  };
}

/**
 * Consulta o estado do token via Graph API. Envia o token apenas na query
 * string para `graph.facebook.com` (o system user token inspeciona a si mesmo)
 * e nunca o registra em log.
 */
export async function checkMetaToken(input: {
  accessToken: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}): Promise<MetaTokenHealth> {
  const version = input.apiVersion ?? "v26.0";
  const fetcher = input.fetchImpl ?? fetch;
  const url = `https://${META_GRAPH_HOST}/${version}/debug_token?input_token=${encodeURIComponent(input.accessToken)}&access_token=${encodeURIComponent(input.accessToken)}`;

  let response: Response;
  try {
    response = await fetcher(url);
  } catch (error) {
    return empty(`falha ao consultar debug_token: ${String(error)}`);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const parsed = parseDebugToken(payload);
    // A Graph API devolve um corpo `{ error: { message } }` em HTTP != 2xx.
    if (parsed.error !== undefined) return parsed;
    return empty(`Graph API HTTP ${String(response.status)}`);
  }
  return parseDebugToken(payload);
}
