import { describe, expect, it } from "vitest";

import { choosePublishPath } from "@/lib/prospecting/publish-path";

describe("choosePublishPath", () => {
  it("usa a Graph API quando há credenciais, mesmo com INSTAGRAM_PROVIDER=browser", () => {
    expect(
      choosePublishPath({ INSTAGRAM_PROVIDER: "browser", META_ACCESS_TOKEN: "t", META_INSTAGRAM_BUSINESS_ID: "1" }),
    ).toBe("graph");
  });
  it("cai no navegador só sem credenciais da Graph API", () => {
    expect(choosePublishPath({ INSTAGRAM_PROVIDER: "browser" })).toBe("browser");
  });
  it("sem credenciais e provedor graph: não configurado", () => {
    expect(choosePublishPath({ INSTAGRAM_PROVIDER: "graph", META_ACCESS_TOKEN: "" })).toBe("unconfigured");
  });
});
