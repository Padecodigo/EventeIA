import { describe, expect, it } from "vitest";

import { metaPublishConfigFromEnv } from "@/lib/meta/config";

describe("metaPublishConfigFromEnv (resolução de host)", () => {
  it("Facebook Login (Page token) força graph.facebook.com", () => {
    const cfg = metaPublishConfigFromEnv({
      META_ACCESS_TOKEN: "su",
      META_PAGE_ACCESS_TOKEN: "page",
      META_PAGE_ID: "pg-1",
      META_INSTAGRAM_BUSINESS_ID: "ig-1",
      META_API_HOST: "graph.instagram.com",
    });
    expect(cfg.apiHost).toBe("graph.facebook.com");
    expect(cfg.pageAccessToken).toBe("page");
  });

  it("Facebook Login (Page id sem token explícito) também força graph.facebook.com", () => {
    const cfg = metaPublishConfigFromEnv({
      META_ACCESS_TOKEN: "su",
      META_PAGE_ID: "pg-1",
      META_INSTAGRAM_BUSINESS_ID: "ig-1",
      META_API_HOST: "graph.instagram.com",
    });
    expect(cfg.apiHost).toBe("graph.facebook.com");
  });

  it("Instagram Login (sem Página) respeita o host informado", () => {
    const cfg = metaPublishConfigFromEnv({
      META_ACCESS_TOKEN: "su",
      META_INSTAGRAM_BUSINESS_ID: "ig-1",
      META_API_HOST: "graph.instagram.com",
    });
    expect(cfg.apiHost).toBe("graph.instagram.com");
  });
});
