import type { MetadataRoute } from "next";

import { PUBLIC_ROUTES, absoluteUrl, siteUrl } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_ROUTES.map((r) => ({
    url: absoluteUrl(r.path, base),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
