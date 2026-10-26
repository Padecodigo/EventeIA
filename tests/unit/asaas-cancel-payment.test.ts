import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/asaas/client.ts importa "server-only" — mock para testar no vitest (node).
vi.mock("server-only", () => ({}));

const original = { ...process.env };
const KEYS = [
  "ASAAS_API_KEY",
  "ASAAS_ENVIRONMENT",
  "ASAAS_API_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/**
 * Regressão: excluir o evento cancela o Pix aberto no Asaas
 * (DELETE /payments/{id}, com access_token).
 */
describe("cancelAsaasPayment", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "a".repeat(24);
    process.env.ASAAS_API_KEY = "$aab_test";
    process.env.ASAAS_ENVIRONMENT = "sandbox";
    delete process.env.ASAAS_API_URL;
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    vi.unstubAllGlobals();
  });

  it("envia DELETE /payments/{id} com o access_token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { cancelAsaasPayment } = await import("@/lib/asaas/client");
    await cancelAsaasPayment("pay_123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/payments/pay_123");
    expect(init.method).toBe("DELETE");
    expect((init.headers as unknown as Record<string, string>).access_token).toBe("$aab_test");
  });

  it("propaga erro quando o Asaas recusa o cancelamento", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("não encontrado", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const { cancelAsaasPayment } = await import("@/lib/asaas/client");
    await expect(cancelAsaasPayment("pay_404")).rejects.toThrow(/Asaas 404/);
  });
});
