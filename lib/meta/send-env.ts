import "server-only";

import { serverEnv } from "@/lib/env";

import { resolveMetaPageCredentials } from "./connection-store";

/**
 * Resolve as credenciais da Meta para envio: usa a Página conectada em /admin/meta
 * quando existir; caso contrário, mantém as credenciais das variáveis de ambiente.
 */
export async function resolveMetaSendEnv(): Promise<ReturnType<typeof serverEnv>> {
  const base = serverEnv();
  const creds = await resolveMetaPageCredentials().catch(() => null);
  if (creds !== null && creds.source === "conexao") {
    return {
      ...base,
      META_PAGE_ID: creds.pageId,
      META_PAGE_ACCESS_TOKEN: creds.pageAccessToken,
      META_INSTAGRAM_BUSINESS_ID: creds.igUserId ?? base.META_INSTAGRAM_BUSINESS_ID,
    };
  }
  return base;
}
