import { afterEach, describe, expect, it, vi } from "vitest";

import { scrubLogFields } from "@/lib/logger";
import { readEvolutionWebhookToken, redactSecrets } from "@/lib/security";

const url = (q = "") => new URL(`http://eventeia-app:3000/api/webhooks/evolution${q}`);

afterEach(() => vi.unstubAllEnvs());

describe("readEvolutionWebhookToken", () => {
  it("prefere o header x-evolution-token", () => {
    expect(readEvolutionWebhookToken(new Headers({ "x-evolution-token": "h" }), url("?token=q"))).toEqual({ token: "h", via: "header" });
  });
  it("aceita Authorization: Bearer", () => {
    expect(readEvolutionWebhookToken(new Headers({ authorization: "Bearer abc" }), url())).toEqual({ token: "abc", via: "header" });
  });
  it("fallback temporário via query (webhook global não envia headers)", () => {
    expect(readEvolutionWebhookToken(new Headers(), url("?token=q"))).toEqual({ token: "q", via: "query" });
  });
  it("query desligável por env", () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_ALLOW_QUERY_TOKEN", "false");
    expect(readEvolutionWebhookToken(new Headers(), url("?token=q"))).toEqual({ token: null, via: null });
  });
  it("sem token", () => {
    expect(readEvolutionWebhookToken(new Headers(), url())).toEqual({ token: null, via: null });
  });
});

describe("redação de segredos em logs", () => {
  it("mascara token/apikey em query strings", () => {
    expect(redactSecrets("http://x/api/webhooks/evolution?token=SEGREDO123&a=1")).toBe(
      "http://x/api/webhooks/evolution?token=[REDACTED]&a=1",
    );
    expect(redactSecrets("GET /y?apikey=k")).toBe("GET /y?apikey=[REDACTED]");
  });
  it("mascara campos sensíveis e strings com URL", () => {
    expect(scrubLogFields({ token: "x", url: "http://h/p?token=abc", n: 1 })).toEqual({
      token: "[REDACTED]",
      url: "http://h/p?token=[REDACTED]",
      n: 1,
    });
  });
});
