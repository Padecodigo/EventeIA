import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type Op } from "../unit/helpers/fake-admin";

/**
 * Integração: webhook Cloud API e webhook Evolution alimentam o MESMO pipeline
 * de entrada (lib/whatsapp/inbound.ts) — Supabase e fila mockados.
 */
const state = vi.hoisted(() => ({
  seen: new Set<string>(),
  enqueued: [] as string[],
  fake: null as null | ReturnType<typeof import("../unit/helpers/fake-admin").createFakeAdmin>,
}));

const SECRET = "app-secret-de-teste";
const VERIFY = "verify-token-de-teste";
const EVO_TOKEN = "token-evolution-com-32-caracteres!";

vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    WHATSAPP_CLOUD_APP_SECRET: SECRET,
    WHATSAPP_CLOUD_VERIFY_TOKEN: VERIFY,
    WHATSAPP_COLLECTION_WINDOW_MINUTES: 2880,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => state.fake!.admin }));
vi.mock("@/lib/quotes/runtime", () => ({
  enqueueQuoteExtraction: (_e: string, prospectId: string) => {
    state.enqueued.push(prospectId);
    return Promise.resolve(true);
  },
}));
vi.mock("@/lib/feeds", () => ({ emitFeed: () => Promise.resolve() }));
vi.mock("@/lib/whatsapp/session-runtime", () => ({ createSessionDeps: () => ({}) }));

function respond(op: Op) {
  if (op.table === "webhook_events" && op.op === "upsert") {
    const id = op.args[0] as { source: string; external_event_id: string };
    const key = `${id.source}:${id.external_event_id}`;
    if (state.seen.has(key)) return { data: null, error: null };
    state.seen.add(key);
    return { data: { id: key }, error: null };
  }
  if (op.table === "vendor_prospects" && op.op === "select") {
    return { data: { id: "prospect-1", event_id: "event-1" }, error: null };
  }
  if (op.table === "vendor_prospects" && op.op === "update") {
    return { data: [{ id: "prospect-1", event_id: "event-1" }], error: null };
  }
  return { data: null, error: null };
}

const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

function cloudPost(payload: unknown, signature?: string | null): Request {
  const body = JSON.stringify(payload);
  const sig = signature === undefined ? sign(body) : signature;
  return new Request("http://localhost/api/webhooks/whatsapp-cloud", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sig !== null ? { "x-hub-signature-256": sig } : {}),
    },
    body,
  });
}

const cloudMessage = (id: string, text: string) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: { messages: [{ id, from: "5519999999999", type: "text", text: { body: text } }] },
        },
      ],
    },
  ],
});

const inboundUpserts = () =>
  state
    .fake!.ops.filter((o) => o.table === "whatsapp_messages" && o.op === "upsert")
    .map((o) => o.args[0] as Record<string, unknown>);

beforeEach(() => {
  state.seen.clear();
  state.enqueued = [];
  state.fake = createFakeAdmin(respond);
  process.env.EVOLUTION_WEBHOOK_TOKEN = EVO_TOKEN;
});

describe("GET /api/webhooks/whatsapp-cloud", () => {
  it("responde o challenge com verify token correto e 403 caso contrário", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp-cloud/route");
    const ok = GET(
      new Request(
        `http://localhost/x?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=123`,
      ),
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("123");
    const bad = GET(
      new Request(
        "http://localhost/x?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123",
      ),
    );
    expect(bad.status).toBe(403);
  });
});

describe("POST /api/webhooks/whatsapp-cloud", () => {
  it("assinatura inválida/ausente ⇒ 401 sem tocar o banco", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp-cloud/route");
    expect(
      (await POST(cloudPost(cloudMessage("wamid.1", "oi"), "sha256=" + "0".repeat(64)))).status,
    ).toBe(401);
    expect((await POST(cloudPost(cloudMessage("wamid.1", "oi"), null))).status).toBe(401);
    expect(state.fake!.ops).toHaveLength(0);
  });

  it("resposta do fornecedor segue o pipeline comum (registro, replied, extração) e é idempotente", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp-cloud/route");
    const res = await POST(cloudPost(cloudMessage("wamid.A", "Valor R$ 80 por pessoa")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, processed: 1 });
    const [msg] = inboundUpserts();
    expect(msg).toMatchObject({
      direction: "inbound",
      channel: "cloud",
      to_number_e164: "+5519999999999",
      idempotency_key: "inbound:wamid.A",
      event_id: "event-1",
      prospect_id: "prospect-1",
    });
    expect(state.enqueued).toEqual(["prospect-1"]);

    const replay = await POST(cloudPost(cloudMessage("wamid.A", "Valor R$ 80 por pessoa")));
    expect(await replay.json()).toEqual({ ok: true, processed: 0 });
    expect(state.enqueued).toEqual(["prospect-1"]);
  });

  it("SAIR ⇒ opt-out global (consents + suppliers + prospects), sem extração", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp-cloud/route");
    await POST(cloudPost(cloudMessage("wamid.B", "SAIR")));
    const tables = state.fake!.ops.map((o) => `${o.table}.${o.op}`);
    expect(tables).toContain("consents.upsert");
    expect(tables).toContain("suppliers.update");
    expect(state.enqueued).toEqual([]);
  });

  it("status de entrega atualiza whatsapp_messages", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp-cloud/route");
    await POST(
      cloudPost({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ value: { statuses: [{ id: "wamid.out", status: "read" }] } }] }],
      }),
    );
    const upd = state.fake!.ops.find((o) => o.table === "whatsapp_messages" && o.op === "update");
    expect(upd?.args[0]).toMatchObject({ status: "read" });
    expect(upd?.filters).toContainEqual(["eq", ["external_message_id", "wamid.out"]]);
  });

  it("payload inválido ⇒ 400", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp-cloud/route");
    expect((await POST(cloudPost({ object: "page" }))).status).toBe(400);
  });
});

describe("POST /api/webhooks/evolution (mesmo pipeline)", () => {
  it("resposta via Evolution grava channel=evolution e enfileira extração", async () => {
    const { POST } = await import("@/app/api/webhooks/evolution/route");
    const res = await POST(
      new Request("http://localhost/api/webhooks/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-evolution-token": EVO_TOKEN },
        body: JSON.stringify({
          event: "messages.upsert",
          instance: "inst-1",
          data: {
            key: { id: "EVO1", remoteJid: "5519999999999@s.whatsapp.net", fromMe: false },
            message: { conversation: "R$ 90" },
          },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(inboundUpserts()[0]).toMatchObject({
      channel: "evolution",
      idempotency_key: "inbound:EVO1",
    });
    expect(state.enqueued).toEqual(["prospect-1"]);
  });
});
