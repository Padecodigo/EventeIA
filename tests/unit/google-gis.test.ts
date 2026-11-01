import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  GOOGLE_GIS_SCRIPT_SRC,
  createGoogleNonce,
  gisButtonWidth,
  googleWebClientId,
} from "@/lib/auth/google-gis";

describe("google-gis", () => {
  it("nonce: Google recebe o SHA-256 hex do nonce cru (doc do Supabase)", async () => {
    const { nonce, hashedNonce } = await createGoogleNonce(webcrypto as unknown as Crypto);
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(hashedNonce).toBe(createHash("sha256").update(nonce).digest("hex"));
    const other = await createGoogleNonce(webcrypto as unknown as Crypto);
    expect(other.nonce).not.toBe(nonce);
  });

  it("client ID vem só de NEXT_PUBLIC_GOOGLE_CLIENT_ID (sem padrão embutido)", () => {
    expect(googleWebClientId({})).toBeNull();
    expect(googleWebClientId({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: "lixo" })).toBeNull();
    expect(
      googleWebClientId({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: " 123-abc.apps.googleusercontent.com " }),
    ).toBe("123-abc.apps.googleusercontent.com");
    expect(readFileSync("lib/auth/google-gis.ts", "utf8")).not.toMatch(
      /\d{6,}-\w+\.apps\.googleusercontent\.com/,
    );
  });

  it("largura do botão acompanha o celular (200–400 px)", () => {
    expect(gisButtonWidth(320)).toBe(320);
    expect(gisButtonWidth(150)).toBe(200);
    expect(gisButtonWidth(900)).toBe(400);
  });

  it("CSP de produção libera só os caminhos /gsi do Google", () => {
    const cfg = readFileSync("next.config.mjs", "utf8");
    expect(GOOGLE_GIS_SCRIPT_SRC).toBe("https://accounts.google.com/gsi/client");
    expect(cfg).toContain("https://accounts.google.com/gsi/client");
    expect(cfg).toContain("style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style");
    expect(cfg).toContain('"frame-src https://accounts.google.com/gsi/"');
    expect(cfg).toMatch(/connect-src[^"]*https:\/\/accounts\.google\.com\/gsi\//);
  });
});
