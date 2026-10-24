import type { MetadataRoute } from "next";

import { SEARCH_AND_AI_BOTS } from "@/lib/seo/bots";
import { PRIVATE_PREFIXES, absoluteUrl, siteUrl } from "@/lib/seo/site";

/** Robôs de busca e de IA podem ler as páginas públicas; área logada fica bloqueada. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  const disallow = PRIVATE_PREFIXES.map((p) => `${p}/`).concat([...PRIVATE_PREFIXES]);
  return {
    rules: [
      { userAgent: [...SEARCH_AND_AI_BOTS], allow: "/", disallow },
      { userAgent: "*", allow: "/", disallow },
    ],
    sitemap: absoluteUrl("/sitemap.xml", base),
    host: base,
  };
}
