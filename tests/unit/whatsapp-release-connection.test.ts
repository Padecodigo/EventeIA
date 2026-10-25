import { describe, expect, it } from "vitest";

import { evolutionConnectionStateSchema } from "@/lib/schemas/whatsapp";
import { shouldReleaseConnection } from "@/lib/whatsapp/session-lifecycle";

const base = {
  evolutionState: "open" as const,
  dbStatus: "connected",
  eventId: "e",
  collectionEndedAt: "2026-10-20T00:00:00Z",
};

describe("shouldReleaseConnection", () => {
  it("coleta encerrada e sessão fora de coleta ⇒ encerra", () => {
    expect(shouldReleaseConnection(base)).toBe(true);
    expect(shouldReleaseConnection({ ...base, dbStatus: "disconnected" })).toBe(true);
  });
  it("mantém durante a coleta, sem evento, coleta aberta ou sessão não aberta", () => {
    expect(shouldReleaseConnection({ ...base, dbStatus: "active" })).toBe(false);
    expect(shouldReleaseConnection({ ...base, dbStatus: "draining" })).toBe(false);
    expect(shouldReleaseConnection({ ...base, eventId: null })).toBe(false);
    expect(shouldReleaseConnection({ ...base, collectionEndedAt: null })).toBe(false);
    expect(shouldReleaseConnection({ ...base, evolutionState: "connecting" })).toBe(false);
  });
});

describe("evolutionConnectionStateSchema", () => {
  it("aceita formato v2 aninhado e o legado", () => {
    expect(
      evolutionConnectionStateSchema.parse({ instance: { instanceName: "i", state: "open" } })
        .state,
    ).toBe("open");
    expect(evolutionConnectionStateSchema.parse({ instance: "i", state: "close" }).state).toBe(
      "close",
    );
  });
});
