import { describe, expect, it } from "vitest";

import { isSessionCookie, sessionExpired } from "@/lib/auth/session-ttl";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60_000;

describe("TTL de sessão", () => {
  it("expira no limite", () => {
    expect(sessionExpired(String(NOW - 119 * 60_000), NOW, 2 * HOUR)).toBe(false);
    expect(sessionExpired(String(NOW - 2 * HOUR), NOW, 2 * HOUR)).toBe(true);
    expect(sessionExpired(String(NOW - 3 * HOUR), NOW, 2 * HOUR)).toBe(true);
  });

  it("sem marcação válida conta como expirada", () => {
    expect(sessionExpired(undefined, NOW, 2 * HOUR)).toBe(true);
    expect(sessionExpired("abc", NOW, 2 * HOUR)).toBe(true);
    expect(sessionExpired("0", NOW, 2 * HOUR)).toBe(true);
  });

  it("reconhece cookies do Supabase", () => {
    expect(isSessionCookie("sb-abc-auth-token")).toBe(true);
    expect(isSessionCookie("ev_session_started")).toBe(false);
  });
});
