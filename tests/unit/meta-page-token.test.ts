import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { messageConfig } from "@/lib/jobs/prospect-reply";
import { instagramSendTarget, messengerAccessToken } from "@/lib/meta/page-token";

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
  it("Instagram usa o Page token quando configurado (regressão: system user dá #100)", () => {
    const cfg = messageConfig({ ...base, channel: "instagram" } as never, env);
    expect(cfg).toMatchObject({ channel: "instagram", accessToken: "page" });
  });
  it("Instagram com Page token envia pelo nó da Página (regressão: /{ig-id}/messages dá 400 subcode 33)", () => {
    const cfg = messageConfig({ ...base, channel: "instagram" } as never, env);
    expect(cfg).toMatchObject({ channel: "instagram", instagramBusinessId: "pg-1" });
  });
  it("Instagram sem Page token mantém o nó do IG business", () => {
    const cfg = messageConfig({ ...base, channel: "instagram" } as never, { ...env, pageAccessToken: undefined });
    expect(cfg).toMatchObject({ instagramBusinessId: "ig-1", accessToken: "su" });
  });
  it("Instagram sem Page token cai para o token geral", () => {
    const cfg = messageConfig({ ...base, channel: "instagram" } as never, { ...env, pageAccessToken: "" });
    expect(cfg.accessToken).toBe("su");
  });
  it("Messenger sem Page token usa o token geral", () => {
    const cfg = messageConfig({ ...base, channel: "messenger" } as never, { ...env, pageAccessToken: undefined });
    expect(cfg.accessToken).toBe("su");
  });
});

describe("instagramSendTarget (regressão: /{ig-id}/messages com Page token dá 400 subcode 33)", () => {
  const full = { META_PAGE_ACCESS_TOKEN: "page", META_ACCESS_TOKEN: "su", META_PAGE_ID: "pg-1", META_INSTAGRAM_BUSINESS_ID: "ig-1" };
  it("com Page token envia pelo nó da Página com o Page token", () => {
    expect(instagramSendTarget(full)).toEqual({ instagramBusinessId: "pg-1", accessToken: "page" });
  });
  it("sem Page token mantém /{ig-id} com o token geral", () => {
    expect(instagramSendTarget({ ...full, META_PAGE_ACCESS_TOKEN: " " })).toEqual({ instagramBusinessId: "ig-1", accessToken: "su" });
  });
});

describe("guarda: nenhum envio de DM do Instagram monta o nó /{ig-id} por conta própria", () => {
  it("call sites usam instagramSendTarget", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of [
      "lib/outreach/window-reminder-supabase.ts",
      "lib/outreach/chat-runtime.ts",
      "app/(dashboard)/eventos/[id]/selection-actions.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("instagramSendTarget(env)");
      expect(src, f).not.toMatch(/instagramBusinessId:\s*env\.META_INSTAGRAM_BUSINESS_ID/);
    }
  });
});
