/** Token para o Messenger: Page token quando configurado, senão o token geral. */
export function messengerAccessToken(env: {
  META_PAGE_ACCESS_TOKEN?: string;
  META_ACCESS_TOKEN?: string;
}): string {
  const page = env.META_PAGE_ACCESS_TOKEN?.trim();
  return page !== undefined && page !== "" ? page : (env.META_ACCESS_TOKEN ?? "");
}

/**
 * Token para Instagram (resolver @ do remetente e enviar DM): Page token quando
 * configurado, senão o token geral. O token de system user devolve (#100) no
 * GET /{igsid}?fields=username; o Page token da página ligada ao IG funciona.
 */
export function pageOrGeneralToken(page: string | undefined, general: string | undefined): string {
  const p = page?.trim();
  return p !== undefined && p !== "" ? p : (general ?? "");
}

/**
 * Destino do envio de DM do Instagram. Com Page token (Facebook Login) o envio
 * é POST /{page-id}/messages — /{ig-id}/messages devolve 400 (#100, subcode 33).
 * Sem Page token, mantém o caminho antigo (/{ig-id}/messages + token geral).
 */
export function instagramSendTarget(env: {
  META_PAGE_ACCESS_TOKEN?: string;
  META_ACCESS_TOKEN?: string;
  META_PAGE_ID?: string;
  META_INSTAGRAM_BUSINESS_ID?: string;
}): { instagramBusinessId: string; accessToken: string } {
  const page = env.META_PAGE_ACCESS_TOKEN?.trim() ?? "";
  const pageId = env.META_PAGE_ID?.trim() ?? "";
  if (page !== "" && pageId !== "") return { instagramBusinessId: pageId, accessToken: page };
  return {
    instagramBusinessId: env.META_INSTAGRAM_BUSINESS_ID ?? "",
    accessToken: env.META_ACCESS_TOKEN ?? "",
  };
}
