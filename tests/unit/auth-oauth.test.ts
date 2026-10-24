import { describe, expect, it } from "vitest";

import { buildCallbackUrl, oauthErrorMessage, safeNextPath } from "@/lib/auth/oauth";

describe("safeNextPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeNextPath("/eventos/1")).toBe("/eventos/1");
  });
  it.each([null, "", "https://mal.com", "//mal.com", "/\\mal.com", "/a\nb"])(
    "rejeita %s (open redirect)",
    (value) => {
      expect(safeNextPath(value)).toBe("/painel");
    },
  );
});

describe("buildCallbackUrl", () => {
  it("aponta para /auth/callback na origem", () => {
    expect(buildCallbackUrl("http://localhost:3000")).toBe("http://localhost:3000/auth/callback");
  });
  it("preserva next interno e descarta externo", () => {
    expect(buildCallbackUrl("https://app.eventeia.com.br", "/creditos")).toBe(
      "https://app.eventeia.com.br/auth/callback?next=%2Fcreditos",
    );
    expect(buildCallbackUrl("https://app.eventeia.com.br", "https://x.com")).toBe(
      "https://app.eventeia.com.br/auth/callback",
    );
  });
});

describe("oauthErrorMessage", () => {
  it("traduz cancelamento e erro genérico", () => {
    expect(oauthErrorMessage(undefined)).toBeUndefined();
    expect(oauthErrorMessage("access_denied")).toMatch(/cancelado/);
    expect(oauthErrorMessage("oauth")).toMatch(/Google/);
  });
});
