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
