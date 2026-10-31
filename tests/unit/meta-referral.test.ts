import { describe, expect, it } from "vitest";

import { parseMetaWebhook } from "@/lib/meta/webhook";
import { eventIdFromRef, windowKindFromReferral } from "@/lib/outreach/window";

describe("referral no webhook do Meta", () => {
  const UUID = "aaaaaaaa-0000-4000-8000-000000000001";

  it("captura referral de anúncio no Instagram (value.referral)", () => {
    const messages = parseMetaWebhook({
      object: "instagram",
      entry: [
        {
          id: "1784",
          changes: [
            {
              field: "messages",
              value: {
                sender: { id: "111" },
                recipient: { id: "1784" },
                message: { mid: "mid-1", text: "olá" },
                referral: { ref: `event:${UUID}`, source: "ADS" },
              },
            },
          ],
        },
      ],
    });
    expect(messages).toHaveLength(1);
    expect(messages?.[0]?.referral).toEqual({ ref: `event:${UUID}`, source: "ADS" });
  });

  it("captura referral aninhado em message.referral (Instagram)", () => {
    const messages = parseMetaWebhook({
      object: "instagram",
      entry: [
        {
          id: "1784",
          changes: [
            {
              field: "messages",
              value: {
                sender: { id: "111" },
                recipient: { id: "1784" },
                message: { mid: "mid-2", text: "quero cotação", referral: { ref: "fornecedor", source: "SHORTLINK" } },
              },
            },
          ],
        },
      ],
    });
    expect(messages?.[0]?.referral).toEqual({ ref: "fornecedor", source: "SHORTLINK" });
  });

  it("captura referral no Messenger (messaging[].referral)", () => {
    const messages = parseMetaWebhook({
      object: "page",
      entry: [
        {
          id: "page-1",
          messaging: [
            {
              sender: { id: "psid-1" },
              recipient: { id: "page-1" },
              message: { mid: "mid-3", text: "oi" },
              referral: { ref: "fornecedor", source: "SHORTLINK" },
            },
          ],
        },
      ],
    });
    expect(messages?.[0]?.referral).toEqual({ ref: "fornecedor", source: "SHORTLINK" });
  });

  it("sem referral devolve null", () => {
    const messages = parseMetaWebhook({
      object: "instagram",
      entry: [
        {
          id: "1784",
          changes: [
            {
              field: "messages",
              value: { sender: { id: "111" }, recipient: { id: "1784" }, message: { mid: "mid-4", text: "oi" } },
            },
          ],
        },
      ],
    });
    expect(messages?.[0]?.referral).toBeUndefined();
  });
});

describe("windowKindFromReferral", () => {
  it("anúncio Click-to-Direct abre 7 dias", () => {
    expect(windowKindFromReferral("ADS")).toBe("ad_7d");
  });

  it("shortlink/ref usa a janela padrão de 24h", () => {
    expect(windowKindFromReferral("SHORTLINK")).toBe("standard_24h");
  });

  it("origem ausente usa a janela padrão de 24h", () => {
    expect(windowKindFromReferral(undefined)).toBe("standard_24h");
    expect(windowKindFromReferral(null)).toBe("standard_24h");
  });
});

describe("eventIdFromRef", () => {
  const UUID = "aaaaaaaa-0000-4000-8000-000000000001";

  it("extrai o uuid de event:<uuid>", () => {
    expect(eventIdFromRef(`event:${UUID}`)).toBe(UUID);
  });

  it("normaliza o uuid para minúsculas", () => {
    expect(eventIdFromRef(`event:${UUID.toUpperCase()}`)).toBe(UUID);
  });

  it("ref sem evento devolve null", () => {
    expect(eventIdFromRef("fornecedor")).toBeNull();
    expect(eventIdFromRef(null)).toBeNull();
    expect(eventIdFromRef(undefined)).toBeNull();
  });
});
