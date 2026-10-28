import { describe, expect, it } from "vitest";

import { ART_TTL_MS, artExpiresAt, isArtExpired } from "@/lib/prospecting/art-ttl";

const NOW = new Date("2026-10-28T12:00:00Z");

describe("TTL da arte (1h)", () => {
  it("expira exatamente 1h depois", () => {
    expect(artExpiresAt(NOW).getTime()).toBe(NOW.getTime() + ART_TTL_MS);
  });

  it("válida até 59min, expirada em 1h", () => {
    const expires = artExpiresAt(NOW);
    expect(isArtExpired(expires, new Date(NOW.getTime() + 59 * 60_000))).toBe(false);
    expect(isArtExpired(expires, new Date(NOW.getTime() + 60 * 60_000))).toBe(true);
  });

  it("sem validade conta como expirada", () => {
    expect(isArtExpired(null, NOW)).toBe(true);
  });
});
