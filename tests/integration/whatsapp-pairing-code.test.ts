import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressão (25/10/2026): "gerou o QR, mas não deu a opção de usar código".
 * Evolution v2.3 com a sessão em `connecting` ignora `?number=` e devolve o QR
 * em cache sem pairingCode; erros vêm com HTTP 200 `{error:true}`; e o
 * connectionState vem aninhado (`{instance:{state}}`).
 */
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    EVOLUTION_API_URL: "https://evo.test",
    EVOLUTION_API_KEY: "segredo-servidor",
    EVOLUTION_INSTANCE: "default",
  }),
  isConfigured: (v: unknown) => typeof v === "string" && v.length > 0,
}));

import { connectInstance, getConnectionState } from "@/lib/evolution-api/client";
import { startPairing, type PairingDeps } from "@/lib/whatsapp/pairing-service";

const QR = { code: "2@x", base64: "data:image/png;base64,QR", count: 1 };
let state: "open" | "connecting" | "close" = "connecting";
let codeReadyAfter = 0;
let connectCalls = 0;
let socketHasNumber = false;
const calls: string[] = [];
const noSleep = async () => {};

function stubEvolution(overrides: { connectBody?: unknown } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push(`${init.method ?? "GET"} ${url}`);
      if (url.includes("/instance/connectionState/"))
        return new Response(JSON.stringify({ instance: { instanceName: "i", state } }));
      if (url.includes("/instance/logout/")) {
        state = "close";
        return new Response(JSON.stringify({ status: "SUCCESS" }));
      }
      if (url.includes("/instance/connect/")) {
        if (overrides.connectBody !== undefined)
          return new Response(JSON.stringify(overrides.connectBody));
        const withNumber = url.includes("number=");
        // Igual à Evolution: o número só vale ao abrir um socket novo (close).
        if (state === "close") {
          state = "connecting";
          socketHasNumber = withNumber;
        }
        connectCalls += 1;
        const code = socketHasNumber && connectCalls > codeReadyAfter ? "ABCD1234" : null;
        return new Response(JSON.stringify({ pairingCode: code, ...QR }));
      }
      return new Response("{}", { status: 500 });
    }),
  );
}

beforeEach(() => {
  state = "connecting";
  codeReadyAfter = 0;
  connectCalls = 0;
  socketHasNumber = false;
  calls.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("connectInstance (regressão do código de pareamento)", () => {
  it("sessão connecting + número: encerra a tentativa pendente e devolve o código", async () => {
    stubEvolution();
    const payload = await connectInstance("i", "5511998765432", { sleep: noSleep });
    expect(payload.pairingCode).toBe("ABCD-1234");
    expect(calls).toContain("DELETE https://evo.test/instance/logout/i");
  });

  it("código atrasado: reconsulta até ficar pronto", async () => {
    state = "close";
    codeReadyAfter = 2;
    stubEvolution();
    const payload = await connectInstance("i", "5511998765432", { sleep: noSleep });
    expect(payload.pairingCode).toBe("ABCD-1234");
    expect(connectCalls).toBe(3);
  });

  it("nunca faz logout de sessão aberta", async () => {
    state = "open";
    stubEvolution({ connectBody: { instance: { instanceName: "i", state: "open" } } });
    const payload = await connectInstance("i", "5511998765432", { sleep: noSleep });
    expect(payload.alreadyConnected).toBe(true);
    expect(calls.some((c) => c.includes("logout"))).toBe(false);
  });

  it("QR sem número continua igual e não mexe na sessão pendente", async () => {
    stubEvolution();
    const payload = await connectInstance("i", "", { sleep: noSleep });
    expect(payload.qrDataUrl).toBe("data:image/png;base64,QR");
    expect(calls.some((c) => c.includes("logout"))).toBe(false);
  });

  it("HTTP 200 com {error:true} vira erro com a mensagem da Evolution", async () => {
    state = "close";
    stubEvolution({ connectBody: { error: true, message: "Error: boom" } });
    await expect(connectInstance("i", "", { sleep: noSleep })).rejects.toThrow(/boom/);
  });

  it("connectionState aninhado (Evolution v2) é lido", async () => {
    state = "open";
    stubEvolution();
    expect(await getConnectionState("i")).toBe("open");
  });
});

describe("startPairing com número", () => {
  const deps = (logError = vi.fn()): PairingDeps => ({
    now: () => 0,
    ownsEvent: async () => true,
    ensureInstanceRow: async () => "i",
    instanceName: async () => "i",
    connect: (i, d) => connectInstance(i, d, { sleep: noSleep, attempts: 2 }),
    connectionState: getConnectionState,
    logError,
  });

  it("só QR quando o código foi pedido ⇒ erro claro (não some em silêncio) e loga", async () => {
    state = "close";
    codeReadyAfter = 99;
    stubEvolution();
    const logError = vi.fn();
    const result = await startPairing(deps(logError), {
      userId: "u",
      eventId: "e",
      phone: "11998765432",
    });
    expect(result.ok).toBe(false);
    expect(logError).toHaveBeenCalled();
  });

  it("falha técnica é logada sem expor segredo", async () => {
    state = "close";
    stubEvolution({ connectBody: { error: true, message: "boom" } });
    const logError = vi.fn();
    const result = await startPairing(deps(logError), { userId: "u", eventId: "e", phone: "" });
    expect(result).toEqual({
      ok: false,
      error: "Não foi possível falar com o WhatsApp agora. Tente novamente.",
    });
    expect(JSON.stringify(logError.mock.calls)).not.toContain("segredo");
  });
});
