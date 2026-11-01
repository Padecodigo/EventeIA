/** Token para o Messenger: Page token quando configurado, senão o token geral. */
export function messengerAccessToken(env: {
  META_PAGE_ACCESS_TOKEN?: string;
  META_ACCESS_TOKEN?: string;
}): string {
  const page = env.META_PAGE_ACCESS_TOKEN?.trim();
  return page !== undefined && page !== "" ? page : (env.META_ACCESS_TOKEN ?? "");
}
