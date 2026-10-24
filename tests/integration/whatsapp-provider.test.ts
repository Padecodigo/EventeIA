import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type Op } from "../unit/helpers/fake-admin";

/** Integração do provider: envio por canal com fetch mockado (Graph API / Evolution). */
const state = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  rows: {} as Record<string, unknown>,
  fake: null as null | ReturnType<typeof import("../unit/helpers/fake-admin").createFakeAdmin>,
}));

vi.mock("@/lib/env", () => ({
  serverEnv: () => state.env,
  isConfigured: (k: string | undefined) => k !== undefined && k.length > 0,
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => state.fake!.admin }));

const BASE_ENV = {
  WHATSAPP_CLOUD_TOKEN: "tok-teste",
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_CLOUD_API_VERSION: "v21.0",
  WHATSAPP_CLOUD_FIRST_CONTACT_TEMPLATE: "eventeia_primeiro_contato",
  WHATSAPP_CLOUD_TEMPLATE_LANGUAGE: "pt_BR",
  WHATSAPP_CLOUD_FIRST_CONTACT_PARAM_COUNT: 3,
  EVOLUTION_API_URL: "http://evo.local",
  EVOLUTION_API_KEY: "evo-key",
  EVOLUTION_INSTANCE: "inst-1",
};
const TEXT =
  "Boa tarde, tudo bem? Aqui é da EventeIA. Gostaria de um orçamento de buffet. Estamos organizando um casamento para 120 convidados. Estamos fazendo um levantamento de orçamentos.";

let calls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  calls = [];
  state.env = { ...BASE_ENV };
  state.rows = {};
  state.fake = createFakeAdmin((op: Op) => ({ data: state.rows[op.table] ?? null, error: null }));
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = String(url).includes("graph.facebook.com")
      ? { messages: [{ id: "wamid.SENT" }] }
      : { key: { id: "EVO-SENT" } };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendFirstContactVia", () => {
  it("cloud: usa template aprovado com o texto como variáveis e Bearer token", async () => {
    const { sendFirstContactVia } = await import("@/lib/whatsapp/provider");
    const r = await sendFirstContactVia("cloud", {
      instance: "inst",
      to: "+5519999999999",
      text: TEXT,
    });
    expect(r).toEqual({ channel: "cloud", externalMessageId: "wamid.SENT" });
    expect(calls[0].url).toBe("https://graph.facebook.com/v21.0/1234567890/messages");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-teste",
    );
    const body = JSON.parse(String(calls[0].init.body)) as {
      type: string;
      template: { name: string; components: { parameters: { text: string }[] }[] };
    };
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("eventeia_primeiro_contato");
    expect(body.template.components[0].parameters.map((p) => p.text).join(" ")).toBe(TEXT);
  });

  it("cloud com erro da Meta ⇒ CloudSendError sem vazar token", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "x", code: 132001 } }), { status: 400 }),
      ),
    );
    const { sendFirstContactVia } = await import("@/lib/whatsapp/provider");
    await expect(
      sendFirstContactVia("cloud", { instance: "i", to: "+5519999999999", text: TEXT }),
    ).rejects.toThrow(/400 \(código 132001\)/);
    await expect(
      sendFirstContactVia("cloud", { instance: "i", to: "+5519999999999", text: TEXT }),
    ).rejects.not.toThrow(/tok-teste/);
  });

  it("cloud não configurada ⇒ CloudNotConfiguredError", async () => {
    state.env = { ...BASE_ENV, WHATSAPP_CLOUD_TOKEN: "" };
    const { sendFirstContactVia } = await import("@/lib/whatsapp/provider");
    await expect(
      sendFirstContactVia("cloud", { instance: "i", to: "+5519999999999", text: TEXT }),
    ).rejects.toThrow(/não configurada/);
  });

  it("evolution: texto puro pela instância do cliente", async () => {
    const { sendFirstContactVia } = await import("@/lib/whatsapp/provider");
    const r = await sendFirstContactVia("evolution", {
      instance: "inst-1",
      to: "+5519999999999",
      text: TEXT,
    });
    expect(r).toEqual({ channel: "evolution", externalMessageId: "EVO-SENT" });
    expect(calls[0].url).toBe("http://evo.local/message/sendText/inst-1");
  });
});

describe("sendTextVia (janela de 24h)", () => {
  it("cloud dentro da janela envia texto livre", async () => {
    const { sendTextVia } = await import("@/lib/whatsapp/provider");
    const now = new Date();
    const r = await sendTextVia("cloud", {
      instance: "",
      to: "+5519999999999",
      text: "Pode detalhar?",
      lastInboundAt: new Date(now.getTime() - 3600_000).toISOString(),
      now,
    });
    expect(r.externalMessageId).toBe("wamid.SENT");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      type: "text",
      text: { body: "Pode detalhar?" },
    });
  });
  it("cloud fora da janela ⇒ WindowClosedError sem chamar a Meta", async () => {
    const { sendTextVia, WindowClosedError } = await import("@/lib/whatsapp/provider");
    await expect(
      sendTextVia("cloud", { instance: "", to: "+5519999999999", text: "x", lastInboundAt: null }),
    ).rejects.toBeInstanceOf(WindowClosedError);
    expect(calls).toHaveLength(0);
  });
  it("evolution ignora a janela", async () => {
    const { sendTextVia } = await import("@/lib/whatsapp/provider");
    const r = await sendTextVia("evolution", {
      instance: "inst-1",
      to: "+5519999999999",
      text: "x",
      lastInboundAt: null,
    });
    expect(r.channel).toBe("evolution");
  });
});

describe("resolveEventChannel", () => {
  it("canal do evento prevalece", async () => {
    state.rows.events = { whatsapp_channel: "evolution", owner_profile_id: "p1" };
    const { resolveEventChannel } = await import("@/lib/whatsapp/provider");
    expect(await resolveEventChannel("e1")).toBe("evolution");
  });
  it("sem canal no evento usa o do cliente; sem nenhum, padrão cloud", async () => {
    state.rows.events = { whatsapp_channel: null, owner_profile_id: "p1" };
    state.rows.profiles = { whatsapp_channel: "evolution" };
    const { resolveEventChannel } = await import("@/lib/whatsapp/provider");
    expect(await resolveEventChannel("e1")).toBe("evolution");
    state.rows.profiles = { whatsapp_channel: null };
    expect(await resolveEventChannel("e1")).toBe("cloud");
  });
  it("sem Cloud configurada ⇒ evolution", async () => {
    state.env = { ...BASE_ENV, WHATSAPP_CLOUD_TOKEN: "" };
    state.rows.events = { whatsapp_channel: "cloud", owner_profile_id: "p1" };
    const { resolveEventChannel } = await import("@/lib/whatsapp/provider");
    expect(await resolveEventChannel("e1")).toBe("evolution");
  });
});
