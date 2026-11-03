/**
 * Caminho de publicação dos posts aprovados no admin.
 *
 * A Graph API (instagram_content_publish: /media + /media_publish) é o caminho
 * oficial e confirma a publicação na hora. O navegador (Playwright) só é usado
 * quando INSTAGRAM_PROVIDER=browser e não há credenciais da Graph API — ele
 * apenas enfileira, e a sessão logada pode expirar sem o admin perceber.
 */
export type PublishPath = "graph" | "browser" | "unconfigured";

export function choosePublishPath(env: {
  INSTAGRAM_PROVIDER: "graph" | "browser";
  META_ACCESS_TOKEN?: string;
  META_INSTAGRAM_BUSINESS_ID?: string;
}): PublishPath {
  const hasGraph =
    (env.META_ACCESS_TOKEN ?? "").length > 0 && (env.META_INSTAGRAM_BUSINESS_ID ?? "").length > 0;
  if (hasGraph) return "graph";
  return env.INSTAGRAM_PROVIDER === "browser" ? "browser" : "unconfigured";
}
