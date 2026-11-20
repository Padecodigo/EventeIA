/**
 * Cliente do Facebook Login / Graph API (puro, sem "server-only").
 * Todas as funções recebem `fetchImpl` para testes offline. Tokens nunca
 * aparecem em mensagens de erro. GETs usam `access_token` na query string
 * (padrão da Graph API).
 */

import { parseGrantedScopes } from "./oauth";

export const GRAPH_API_BASE = "https://graph.facebook.com";

export type GraphResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number | null };

export interface ManagedPage {
  id: string;
  name: string;
  pictureUrl: string | null;
  accessToken: string;
  igUserId: string | null;
  igUsername: string | null;
}

export interface UserTokenResult {
  accessToken: string;
  expiresIn: number | null;
}

export interface MeResult {
  id: string;
  name: string | null;
}

interface GraphErrorPayload {
  error?: { message?: string };
}

interface TokenPayload {
  access_token?: string;
  expires_in?: number;
}

interface MePayload {
  id?: string;
  name?: string;
}

interface PermissionsPayload {
  data?: Array<{ permission?: string; status?: string }>;
}

interface PagePicturePayload {
  data?: { url?: string };
}

interface PageIgPayload {
  id?: string;
  username?: string;
}

interface PagePayload {
  id?: string;
  name?: string;
  access_token?: string;
  picture?: PagePicturePayload;
  instagram_business_account?: PageIgPayload;
}

interface AccountsPayload {
  data?: PagePayload[];
}

function apiUrl(apiVersion: string, path: string, params: Record<string, string>): string {
  const url = new URL(`${GRAPH_API_BASE}/${apiVersion}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function asErrorMessage(payload: unknown, status: number): string {
  if (payload !== null && typeof payload === "object") {
    const { error } = payload as GraphErrorPayload;
    if (error !== undefined && typeof error.message === "string" && error.message.length > 0) {
      return error.message;
    }
  }
  return `HTTP ${String(status)}`;
}

async function getJson<T>(url: string, fetchImpl?: typeof fetch): Promise<GraphResult<T>> {
  const fetcher = fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetcher(url, { method: "GET" });
  } catch {
    return { ok: false, error: "falha de rede ao chamar a Graph API", status: null };
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    if (!response.ok) {
      return { ok: false, error: `HTTP ${String(response.status)}`, status: response.status };
    }
    return { ok: false, error: "resposta inválida da Graph API", status: response.status };
  }

  if (!response.ok) {
    return { ok: false, error: asErrorMessage(payload, response.status), status: response.status };
  }

  if (payload === null || typeof payload !== "object") {
    return { ok: false, error: "resposta inválida da Graph API", status: response.status };
  }

  return { ok: true, data: payload as T };
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export interface ExchangeCodeInput {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
}

export async function exchangeCodeForUserToken(
  input: ExchangeCodeInput,
): Promise<GraphResult<UserTokenResult>> {
  const url = apiUrl(input.apiVersion, "oauth/access_token", {
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    client_secret: input.appSecret,
    code: input.code,
  });

  const result = await getJson<TokenPayload>(url, input.fetchImpl);
  if (!result.ok) return result;

  const accessToken = toOptionalString(result.data.access_token);
  if (accessToken === null) {
    return { ok: false, error: "resposta sem access_token", status: null };
  }

  const expiresIn =
    typeof result.data.expires_in === "number" && Number.isFinite(result.data.expires_in)
      ? result.data.expires_in
      : null;

  return { ok: true, data: { accessToken, expiresIn } };
}

export interface LongLivedTokenInput {
  userToken: string;
  appId: string;
  appSecret: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
}

export async function exchangeForLongLivedUserToken(
  input: LongLivedTokenInput,
): Promise<GraphResult<UserTokenResult>> {
  const url = apiUrl(input.apiVersion, "oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: input.appId,
    client_secret: input.appSecret,
    fb_exchange_token: input.userToken,
  });

  const result = await getJson<TokenPayload>(url, input.fetchImpl);
  if (!result.ok) return result;

  const accessToken = toOptionalString(result.data.access_token);
  if (accessToken === null) {
    return { ok: false, error: "resposta sem access_token", status: null };
  }

  const expiresIn =
    typeof result.data.expires_in === "number" && Number.isFinite(result.data.expires_in)
      ? result.data.expires_in
      : null;

  return { ok: true, data: { accessToken, expiresIn } };
}

export interface FetchMeInput {
  userToken: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
}

export async function fetchMe(input: FetchMeInput): Promise<GraphResult<MeResult>> {
  const url = apiUrl(input.apiVersion, "me", {
    fields: "id,name",
    access_token: input.userToken,
  });

  const result = await getJson<MePayload>(url, input.fetchImpl);
  if (!result.ok) return result;

  const id = toOptionalString(result.data.id);
  if (id === null) {
    return { ok: false, error: "resposta sem id de usuário", status: null };
  }

  return { ok: true, data: { id, name: toOptionalString(result.data.name) } };
}

export interface FetchGrantedScopesInput {
  userToken: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
}

export async function fetchGrantedScopes(
  input: FetchGrantedScopesInput,
): Promise<GraphResult<string[]>> {
  const url = apiUrl(input.apiVersion, "me/permissions", {
    access_token: input.userToken,
  });

  const result = await getJson<PermissionsPayload>(url, input.fetchImpl);
  if (!result.ok) return result;

  return { ok: true, data: parseGrantedScopes(result.data) };
}

export interface ListManagedPagesInput {
  userToken: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
}

export async function listManagedPages(
  input: ListManagedPagesInput,
): Promise<GraphResult<ManagedPage[]>> {
  const url = apiUrl(input.apiVersion, "me/accounts", {
    fields: "id,name,access_token,picture{url},instagram_business_account{id,username}",
    limit: "100",
    access_token: input.userToken,
  });

  const result = await getJson<AccountsPayload>(url, input.fetchImpl);
  if (!result.ok) return result;

  const rawPages = Array.isArray(result.data.data) ? result.data.data : [];
  const pages: ManagedPage[] = [];

  for (const page of rawPages) {
    const id = toOptionalString(page.id);
    const name = toOptionalString(page.name);
    const accessToken = toOptionalString(page.access_token);
    if (id === null || name === null || accessToken === null) continue;

    const igAccount = page.instagram_business_account;

    pages.push({
      id,
      name,
      pictureUrl: toOptionalString(page.picture?.data?.url),
      accessToken,
      igUserId: toOptionalString(igAccount?.id),
      igUsername: toOptionalString(igAccount?.username),
    });
  }

  return { ok: true, data: pages };
}
