import { describe, expect, it } from "vitest";

import {
  friendlyPasswordError,
  needsReauthentication,
  passwordStrength,
  userHasPassword,
  validateNewPassword,
} from "@/lib/auth/password";

describe("validateNewPassword", () => {
  it("exige mínimo de 8, máximo de 72 e confirmação igual", () => {
    expect(validateNewPassword("1234567", "1234567")).toMatch(/8 caracteres/);
    expect(validateNewPassword("a".repeat(73), "a".repeat(73))).toMatch(/72/);
    expect(validateNewPassword("abcdefgh", "abcdefgx")).toBe("As senhas não conferem.");
    expect(validateNewPassword("abcdefgh", "abcdefgh")).toBeNull();
  });
});

describe("passwordStrength", () => {
  it("classifica fraca/média/forte", () => {
    expect(passwordStrength("abc")).toBe("fraca");
    expect(passwordStrength("abcdefgh")).toBe("fraca");
    expect(passwordStrength("abcdefg1")).toBe("média");
    expect(passwordStrength("Abcdef1!")).toBe("forte");
  });
});

describe("needsReauthentication / friendlyPasswordError", () => {
  it("detecta reauthentication_needed", () => {
    expect(needsReauthentication({ code: "reauthentication_needed", message: "x" })).toBe(true);
    expect(needsReauthentication({ message: "Password update requires reauthentication" })).toBe(
      true,
    );
    expect(needsReauthentication({ code: "weak_password", message: "weak" })).toBe(false);
    expect(needsReauthentication(null)).toBe(false);
  });
  it("traduz erros", () => {
    expect(friendlyPasswordError({ code: "same_password" })).toMatch(/diferente/);
    expect(friendlyPasswordError({ code: "weak_password" })).toMatch(/fraca/);
    expect(friendlyPasswordError({ code: "reauthentication_not_valid" })).toMatch(/Código/);
  });
});

describe("userHasPassword", () => {
  it("Google puro não tem senha; identidade email ou marca has_password tem", () => {
    expect(userHasPassword({ identities: [{ provider: "google" }] })).toBe(false);
    expect(userHasPassword({ identities: [{ provider: "google" }, { provider: "email" }] })).toBe(
      true,
    );
    expect(
      userHasPassword({
        identities: [{ provider: "google" }],
        app_metadata: { has_password: true },
      }),
    ).toBe(true);
    expect(userHasPassword(null)).toBe(false);
  });
});
