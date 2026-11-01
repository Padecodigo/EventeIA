import { describe, expect, it } from "vitest";
import { parseMetaWebhook } from "@/lib/meta/webhook";

const msg = (mid: string, extra: Record<string, unknown> = {}) => ({
  sender: { id: "u1" }, recipient: { id: "ig1" }, timestamp: 1, message: { mid, text: "oi, tenho buffet", ...extra },
});

describe("regressão P0: Instagram entry[].messaging[]", () => {
  it("parseia DM real no formato messaging[]", () => {
    const r = parseMetaWebhook({ object: "instagram", entry: [{ id: "ig1", time: 1, messaging: [msg("m1")] }] });
    expect(r).toEqual([{ source: "instagram", eventId: "m1", senderId: "u1", recipientId: "ig1", text: "oi, tenho buffet" }]);
  });
  it("mantém referral (ig.me ?ref=evento)", () => {
    const r = parseMetaWebhook({ object: "instagram", entry: [{ messaging: [{ ...msg("m2"), referral: { ref: "evt_1", source: "SHORTLINK", type: "OPEN_THREAD" } }] }] });
    expect(r?.[0]?.referral).toBeDefined();
  });
  it("ignora eco (is_echo) no IG e no Messenger", () => {
    expect(parseMetaWebhook({ object: "instagram", entry: [{ messaging: [msg("m3", { is_echo: true })] }] })).toEqual([]);
    expect(parseMetaWebhook({ object: "page", entry: [{ messaging: [msg("m4", { is_echo: true })] }] })).toEqual([]);
  });
  it("dedupe quando o mesmo mid vem em changes[] e messaging[]", () => {
    const r = parseMetaWebhook({ object: "instagram", entry: [{ messaging: [msg("m5")], changes: [{ field: "messages", value: msg("m5") }] }] });
    expect(r).toHaveLength(1);
  });
  it("formato changes[] continua funcionando", () => {
    expect(parseMetaWebhook({ object: "instagram", entry: [{ changes: [{ field: "messages", value: msg("m6") }] }] })).toHaveLength(1);
  });
});
