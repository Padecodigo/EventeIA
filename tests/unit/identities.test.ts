import { describe, expect, it } from "vitest";

import { canUnlinkIdentity, hasIdentityProvider } from "@/lib/auth/identities";

const facebook = [{ provider: "facebook" }];
const facebookGoogle = [{ provider: "facebook" }, { provider: "google" }];

describe("canUnlinkIdentity", () => {
  it("recusa provider que não está vinculado", () => {
    expect(canUnlinkIdentity(facebookGoogle, "apple", true)).toBe(false);
    expect(canUnlinkIdentity([], "facebook", true)).toBe(false);
  });
  it("recusa desconectar a última identidade de conta sem senha", () => {
    expect(canUnlinkIdentity(facebook, "facebook", false)).toBe(false);
  });
  it("permite desconectar a última identidade se a conta tem senha", () => {
    expect(canUnlinkIdentity(facebook, "facebook", true)).toBe(true);
  });
  it("permite desconectar se resta outra identidade, mesmo sem senha", () => {
    expect(canUnlinkIdentity(facebookGoogle, "facebook", false)).toBe(true);
  });
});

describe("hasIdentityProvider", () => {
  it("detecta o provider", () => {
    expect(hasIdentityProvider(facebookGoogle, "google")).toBe(true);
    expect(hasIdentityProvider(facebookGoogle, "email")).toBe(false);
  });
});
