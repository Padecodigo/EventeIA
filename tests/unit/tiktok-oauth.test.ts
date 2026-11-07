import { describe, expect, it } from "vitest";

import {
  buildAuthorizeUrl,
  constantTimeEqual,
  generatePkce,
  generateState,
  s256Challenge,
  TIKTOK_SCOPE,
} from "@/lib/tiktok/oauth";

describe("generatePkce (S256)", () => {
  it("gera verifier base64url >= 43 chars e challenge S256 determinístico", () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toBe(s256Challenge(verifier));
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("gera pares distintos a cada chamada", () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe("generateState", () => {
  it("gera >= 43 chars (32 bytes) e base64url", () => {
    const state = generateState();
    expect(state.length).toBeGreaterThanOrEqual(43);
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("gera states distintos", () => {
    expect(generateState()).not.toBe(generateState());
  });
});

describe("buildAuthorizeUrl", () => {
  it("monta a URL exata do authorize com todos os parâmetros", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientKey: "awv123",
        redirectUri: "https://app.eventeia.com.br/tiktok/callback",
        scope: TIKTOK_SCOPE,
        state: "abc123",
        codeChallenge: "challengeXYZ",
      }),
    );

    expect(url.origin).toBe("https://www.tiktok.com");
    expect(url.pathname).toBe("/v2/auth/authorize/");
    expect(url.searchParams.get("client_key")).toBe("awv123");
    expect(url.searchParams.get("scope")).toBe(TIKTOK_SCOPE);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.eventeia.com.br/tiktok/callback",
    );
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("code_challenge")).toBe("challengeXYZ");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("não pede video.publish (publicação é draft-only)", () => {
    expect(TIKTOK_SCOPE).toContain("video.upload");
    expect(TIKTOK_SCOPE).not.toContain("video.publish");
  });
});

describe("constantTimeEqual", () => {
  it("aceita strings iguais e rejeita diferentes", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });

  it("rejeita comprimentos distintos", () => {
    expect(constantTimeEqual("abc", "ab")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
  });

  it("rejeita string vazia contra vazia corretamente (true)", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
