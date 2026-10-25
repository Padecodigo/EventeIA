import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração: serviço de pareamento + cliente real da Evolution com fetch
 * simulado (verifica URL, apikey só no header do servidor e criação da instância).
 */
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    EVOLUTION_API_URL: "https://evo.test/",
    EVOLUTION_API_KEY: "segredo-servidor",
    EVOLUTION_INSTANCE: "default",
  }),
  isConfigured: (v: unknown) => typeof v === "string" && v.length > 0,
}));

import { connectInstance, getConnectionState } from "@/lib/evolution-api/client";
import { newInstanceNameFor } from "@/lib/whatsapp/instance-store";
import { checkPairing, startPairing, type PairingDeps } from "@/lib/whatsapp/pairing-service";

const USER = "abcdef12-3456-4789-8abc-def012345678";
const EVENT = "e1111111-1111-4111-8111-111111111111";
const calls: { url: string; method: string; apikey: string | null }[] = [];
let instanceExists = false;
let rows: string[] = [];

function deps(owns = true): PairingDeps {
  return {
    now: () => 1_000_000,
    ownsEvent: async () => owns,
    ensureInstanceRow: async ({ userId }) => {
      const instance = newInstanceNameFor(userId);
      if (!rows.includes(instance)) rows.push(instance);
      return instance;
    },
    instanceName: async (userId) => newInstanceNameFor(userId),
    connect: connectInstance,
    connectionState: getConnectionState,
  };
}

beforeEach(() => {
  calls.length = 0;
  rows = [];
  instanceExists = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({ url: input, method: init.method ?? "GET", apikey: headers.get("apikey") });
      if (input.includes("/instance/create")) {
        instanceExists = true;
        return new Response(JSON.stringify({ instance: { instanceName: "x" } }), { status: 201 });
      }
      if (input.includes("/instance/connect/")) {
        if (!instanceExists)
          return new Response('{"message":"instance does not exist"}', { status: 404 });
        return new Response(
          JSON.stringify({
            pairingCode: "WZYX1234",
            code: "2@x",
            base64: "data:image/png;base64,QR",
          }),
        );
      }
      if (input.includes("/instance/connectionState/")) {
        return new Response(JSON.stringify({ instance: "x", state: "open" }));
      }
      return new Response("{}", { status: 500 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("pareamento do WhatsApp", () => {
  it("cria a instância quando falta e devolve QR + código com expiração", async () => {
    const result = await startPairing(deps(), {
      userId: USER,
      eventId: EVENT,
      phone: "(11) 99876-5432",
    });
    expect(result).toEqual({
      ok: true,
      pairingCode: "WZYX-1234",
      qrDataUrl: "data:image/png;base64,QR",
      expiresAt: 1_060_000,
      connected: false,
    });
    expect(rows).toEqual(["eventeia-abcdef12345647898abcdef012345678"]);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://evo.test/instance/connect/eventeia-abcdef12345647898abcdef012345678?number=5511998765432",
      "POST https://evo.test/instance/create",
      "GET https://evo.test/instance/connect/eventeia-abcdef12345647898abcdef012345678?number=5511998765432",
    ]);
    expect(calls.every((c) => c.apikey === "segredo-servidor")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("segredo");
  });

  it("valida o número antes de chamar a Evolution", async () => {
    const result = await startPairing(deps(), { userId: USER, eventId: EVENT, phone: "123" });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("recusa evento de outro usuário", async () => {
    const result = await startPairing(deps(false), {
      userId: USER,
      eventId: EVENT,
      phone: "11998765432",
    });
    expect(result).toEqual({ ok: false, error: "Evento não encontrado." });
    expect(calls).toHaveLength(0);
  });

  it("erro da Evolution vira mensagem amigável", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const result = await startPairing(deps(), {
      userId: USER,
      eventId: EVENT,
      phone: "11998765432",
    });
    expect(result).toEqual({
      ok: false,
      error: "Não foi possível falar com o WhatsApp agora. Tente novamente.",
    });
  });

  it("polling devolve o estado da conexão", async () => {
    expect(await checkPairing(deps(), { userId: USER, eventId: EVENT })).toEqual({ state: "open" });
    expect(await checkPairing(deps(false), { userId: USER, eventId: EVENT })).toEqual({
      state: "unknown",
    });
  });
});
