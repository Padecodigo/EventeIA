import { afterEach, describe, expect, it, vi } from "vitest";

// lib/env.ts importa "server-only" — mock para poder testar no vitest (node).
vi.mock("server-only", () => ({}));

const KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "ASAAS_API_KEY",
  "EVOLUTION_API_KEY",
  "B2C_TICKET_PRICE_CENTS",
  "WHATSAPP_MIN_INTERVAL_SECONDS",
  "WHATSAPP_COLLECTION_WINDOW_MINUTES",
  "WHATSAPP_PROSPECTING_CONCURRENCY",
] as const;

/**
 * Regressão: o checkout (BuyTicketForm) chama serverEnv() para o preço do
 * tíquete. Em dev as chaves de API são "" — serverEnv() deve VALIDAR e
 * degradar no uso (AsaasNotConfiguredError), nunca estourar na página.
 */
describe("serverEnv", () => {
  const original = { ...process.env };

  afterEach(() => {
    for (const key of KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
    vi.resetModules();
  });

  it("aceita chaves de API vazias (ambiente de desenvolvimento)", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "a".repeat(24);
    process.env.ASAAS_API_KEY = "";
    process.env.EVOLUTION_API_KEY = "";

    const env = (await import("@/lib/env")) as typeof import("@/lib/env");

    expect(() => env.serverEnv()).not.toThrow();
    expect(env.serverEnv().B2C_TICKET_PRICE_CENTS).toBe(9700);
  });

  it("isConfigured: vazio/ausente = falso; presente = verdadeiro", async () => {
    const env = (await import("@/lib/env")) as typeof import("@/lib/env");

    expect(env.isConfigured("")).toBe(false);
    expect(env.isConfigured(undefined)).toBe(false);
    expect(env.isConfigured("$aab_key")).toBe(true);
  });

  it("string vazia em variável numérica usa o default (o compose passa \"\")", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "a".repeat(24);
    process.env.B2C_TICKET_PRICE_CENTS = "";
    process.env.WHATSAPP_MIN_INTERVAL_SECONDS = "";
    process.env.WHATSAPP_COLLECTION_WINDOW_MINUTES = "";
    process.env.WHATSAPP_PROSPECTING_CONCURRENCY = "";

    const env = (await import("@/lib/env")) as typeof import("@/lib/env");

    expect(env.serverEnv().B2C_TICKET_PRICE_CENTS).toBe(9700);
    expect(env.serverEnv().WHATSAPP_MIN_INTERVAL_SECONDS).toBe(60);
    expect(env.serverEnv().WHATSAPP_COLLECTION_WINDOW_MINUTES).toBe(1440);
    expect(env.serverEnv().WHATSAPP_PROSPECTING_CONCURRENCY).toBe(25);
  });
});
