import { describe, expect, it } from "vitest";

import {
  CONNECTION_POLL_FAST_MS,
  CONNECTION_POLL_FAST_WINDOW_MS,
  CONNECTION_POLL_INTERVAL_MS,
  connectRetryDelayMs,
  nextConnectionPollDelayMs,
} from "@/lib/whatsapp/pairing";

describe("tempos da conexão do WhatsApp", () => {
  it("polling rápido (1s) logo após mostrar o QR/código, depois 3s", () => {
    expect(nextConnectionPollDelayMs(0)).toBe(CONNECTION_POLL_FAST_MS);
    expect(CONNECTION_POLL_FAST_MS).toBeLessThanOrEqual(1_000);
    expect(nextConnectionPollDelayMs(CONNECTION_POLL_FAST_WINDOW_MS - 1)).toBe(1_000);
    expect(nextConnectionPollDelayMs(CONNECTION_POLL_FAST_WINDOW_MS)).toBe(
      CONNECTION_POLL_INTERVAL_MS,
    );
    expect(CONNECTION_POLL_INTERVAL_MS).toBeLessThan(4_000);
  });

  it("primeiro retry curto e crescente, com teto", () => {
    expect(connectRetryDelayMs(0)).toBeLessThanOrEqual(500);
    expect(connectRetryDelayMs(1)).toBeGreaterThan(connectRetryDelayMs(0));
    expect(connectRetryDelayMs(99)).toBe(2_000);
  });
});
