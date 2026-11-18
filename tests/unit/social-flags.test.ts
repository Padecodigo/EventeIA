import { describe, expect, it } from "vitest";

import {
  isEnvFlagEnabled,
  isFacebookLoginEnabled,
  isInstagramLoginEnabled,
} from "@/lib/auth/social-flags";

describe("isEnvFlagEnabled", () => {
  it.each(["1", "true", "TRUE", " yes ", "on"])("liga com %j", (value) => {
    expect(isEnvFlagEnabled(value)).toBe(true);
  });
  it.each([undefined, null, "", "0", "false", "off", "no"])("desliga com %j", (value) => {
    expect(isEnvFlagEnabled(value)).toBe(false);
  });
});

describe("flags default off", () => {
  it("Facebook e Instagram ficam off sem env", () => {
    expect(isFacebookLoginEnabled({})).toBe(false);
    expect(isInstagramLoginEnabled({})).toBe(false);
  });
  it("Facebook liga só com a flag própria", () => {
    expect(isFacebookLoginEnabled({ NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED: "true" })).toBe(true);
    expect(isFacebookLoginEnabled({ NEXT_PUBLIC_INSTAGRAM_LOGIN_ENABLED: "true" })).toBe(false);
  });
});
