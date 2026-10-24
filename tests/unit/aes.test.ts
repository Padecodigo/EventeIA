import { describe, expect, it } from "vitest";

import {
  decryptJson,
  encryptJson,
  hasCredentialsKey,
} from "@/lib/crypto/aes";

const SECRET = "a".repeat(64);

describe("AES-256-GCM (credenciais de instância)", () => {
  it("roundtrip: criptografa e descriptografa JSON", () => {
    const credentials = { token: "abc123", session: "xyz" };

    const encrypted = encryptJson(credentials, SECRET);
    expect(encrypted).not.toContain("abc123");

    const decrypted = decryptJson<typeof credentials>(encrypted, SECRET);
    expect(decrypted).toEqual(credentials);
  });

  it("IV único por chamada (ciphertexts distintos)", () => {
    const a = encryptJson({ token: "t" }, SECRET);
    const b = encryptJson({ token: "t" }, SECRET);
    expect(a).not.toBe(b);
  });

  it("payload adulterado falha (integridade GCM)", () => {
    const encrypted = encryptJson({ token: "t" }, SECRET);
    const raw = Buffer.from(encrypted, "base64");
    raw[raw.length - 1] ^= 0xff;

    expect(() => decryptJson(raw.toString("base64"), SECRET)).toThrow();
  });

  it("chave errada falha", () => {
    const encrypted = encryptJson({ token: "t" }, SECRET);
    expect(() => decryptJson(encrypted, "b".repeat(64))).toThrow();
  });

  it("hasCredentialsKey: vazio/ausente = falso", () => {
    expect(hasCredentialsKey(undefined)).toBe(false);
    expect(hasCredentialsKey("")).toBe(false);
    expect(hasCredentialsKey("  ")).toBe(false);
    expect(hasCredentialsKey(SECRET)).toBe(true);
  });
});
