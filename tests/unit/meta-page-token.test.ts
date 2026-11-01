import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { messageConfig } from "@/lib/jobs/prospect-reply";
import { messengerAccessToken } from "@/lib/meta/page-token";

describe("messengerAccessToken", () => {
  it("prefere o Page token quando configurado", () => {
    expect(messengerAccessToken({ META_PAGE_ACCESS_TOKEN: "page", META_ACCESS_TOKEN: "su" })).toBe("page");
  });
  it("cai para o token geral quando o Page token está ausente ou vazio", () => {
    expect(messengerAccessToken({ META_ACCESS_TOKEN: "su" })).toBe("su");
    expect(messengerAccessToken({ META_PAGE_ACCESS_TOKEN: "  ", META_ACCESS_TOKEN: "su" })).toBe("su");
    expect(messengerAccessToken({})).toBe("");
  });
});

describe("messageConfig (regressão: Messenger exige Page token)", () => {
  const env = { accessToken: "su", pageAccessToken: "page", igBusinessId: "ig-1", pageId: "pg-1" };
  const base = { conversationId: "c", supplierId: "s", senderId: "u", text: "oi" };

  it("Messenger usa o Page token", () => {
    const cfg = messageConfig({ ...base, channel: "messenger" } as never, env);
    expect(cfg).toMatchObject({ channel: "messenger", pageId: "pg-1", accessToken: "page" });
  });
  it("Instagram continua com o token geral", () => {
    const cfg = messageConfig({ ...base, channel: "instagram" } as never, env);
    expect(cfg).toMatchObject({ channel: "instagram", accessToken: "su" });
  });
  it("Messenger sem Page token usa o token geral", () => {
    const cfg = messageConfig({ ...base, channel: "messenger" } as never, { ...env, pageAccessToken: undefined });
    expect(cfg.accessToken).toBe("su");
  });
});
