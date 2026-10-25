import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração: rota do webhook Evolution — autenticação por header (preferida),
 * fallback temporário por query e logs sem o token. Supabase não é tocado:
 * JSON inválido retorna 400 logo após a autenticação.
 */
const TOKEN = "token-evolution-com-32-caracteres!";
const logs: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));

import { POST } from "@/app/api/webhooks/evolution/route";
import { logger } from "@/lib/logger";

function req(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://eventeia-app:3000${path}`, { method: "POST", headers, body: "{nao-json" });
}

beforeEach(() => {
  vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", TOKEN);
  logs.length = 0;
  vi.spyOn(logger, "warn").mockImplementation(((...args: unknown[]) => {
    logs.push(JSON.stringify(args));
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("webhook Evolution — token", () => {
  it("aceita o token no header", async () => {
    expect((await POST(req("/api/webhooks/evolution", { "x-evolution-token": TOKEN }))).status).toBe(400);
  });
  it("aceita Authorization: Bearer", async () => {
    expect((await POST(req("/api/webhooks/evolution", { authorization: `Bearer ${TOKEN}` }))).status).toBe(400);
  });
  it("fallback por query enquanto o webhook global não envia headers", async () => {
    expect((await POST(req(`/api/webhooks/evolution?token=${encodeURIComponent(TOKEN)}`))).status).toBe(400);
  });
  it("query desligada por env ⇒ 401", async () => {
    vi.stubEnv("EVOLUTION_WEBHOOK_ALLOW_QUERY_TOKEN", "false");
    expect((await POST(req(`/api/webhooks/evolution?token=${encodeURIComponent(TOKEN)}`))).status).toBe(401);
  });
  it("token errado ⇒ 401 e o log não contém o token recebido", async () => {
    const res = await POST(req("/api/webhooks/evolution?token=vazado-no-log-123"));
    expect(res.status).toBe(401);
    expect(logs.join("\n")).not.toContain("vazado-no-log-123");
  });
});
