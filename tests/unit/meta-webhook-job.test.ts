import { describe, expect, it, vi } from "vitest";

import {
  handleMetaWebhookJob,
  type MetaWebhookJobDeps,
} from "@/lib/jobs/meta-webhook";
import type { MetaCommentEvent, MetaInboundMessage } from "@/lib/meta/webhook";
import type { MetaSupplierLookup } from "@/lib/meta/resolve";
import type { SupplierConversationStore } from "@/lib/outreach/supplier-conversations";
import type { ProspectStore } from "@/lib/prospecting/inbound";
import { shouldAgentRespond } from "@/lib/prospecting/respond";
import type { RespondDb } from "@/lib/prospecting/supabase-respond";

function noopStore(): ProspectStore {
  return {
    findConversation: async () => null,
    createConversation: async () => ({ id: "c1", status: "open" }),
    insertMessage: async () => true,
    updateConversation: async () => undefined,
  };
}

function noopSupplierConversations(): SupplierConversationStore {
  return {
    find: async () => null,
    upsert: async () => ({
      id: "sc1",
      channel: "instagram",
      externalUserId: "111",
      eventId: null,
      supplierId: null,
      ref: null,
      lastInboundAt: null,
      windowExpiresAt: null,
      windowKind: "standard_24h",
      status: "open",
    }),
    insertMessage: async () => true,
  };
}

function fakeWebhookEvents(initial: Record<string, string> = {}) {
  const statuses = new Map(Object.entries(initial));
  const updates: { externalEventId: string; status: string }[] = [];
  const db = {
    from: () => {
      let externalEventId = "";
      return {
        select: () => ({
          eq: () => ({
            eq: (column: string, value: string) => {
              if (column === "external_event_id") externalEventId = value;
              return {
                maybeSingle: async () => {
                  const status = statuses.get(externalEventId);
                  return {
                    data: status === undefined ? null : { id: `wh-${externalEventId}`, status },
                    error: null,
                  };
                },
              };
            },
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: () => ({
            eq: (column: string, value: string) => {
              if (column === "external_event_id") externalEventId = value;
              updates.push({ externalEventId, status: values.status as string });
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    },
  };
  return { statuses, updates, db };
}

function msg(
  eventId: string,
  source: "instagram" | "messenger",
  text: string,
  senderId = "111",
): MetaInboundMessage {
  return { source, eventId, senderId, recipientId: "1784", text, referral: null };
}

function comment(commentId: string, text: string, senderUsername = "buffet_da_ana"): MetaCommentEvent {
  return { commentId, text, senderId: "u1", senderUsername, mediaId: null, createdTime: null };
}

function makeDeps(overrides: Partial<MetaWebhookJobDeps> = {}) {
  const webhookEvents = fakeWebhookEvents();
  const enqueueReply = vi.fn(async (_data: unknown) => true);
  const markOptOut = vi.fn(async () => undefined);
  const sendReply = vi.fn(async (_input: unknown) => ({ ok: true as const, id: "m" }));
  const inbound = vi.fn(async () => ({
    action: { action: "open_conversation" as const, messageId: "m1" },
    conversation: { id: "c1", status: "awaiting_human" as const },
    recorded: true,
  }));
  const resolveSupplier = vi.fn(async () => ({ id: "s1", name: "Buffet da Ana", category: "buffet" }));
  const resolveSupplierByHandle = vi.fn(async () => null);

  const deps = {
    env: { keyword: "cotação", accessToken: "tok", igBusinessId: "ig-1", pageId: "pg-1" },
    store: noopStore(),
    respondDb: {} as RespondDb,
    lookup: {} as MetaSupplierLookup,
    webhookEvents: webhookEvents.db,
    supplierConversations: noopSupplierConversations(),
    resolveSupplier,
    resolveSupplierByHandle,
    inbound,
    markOptOut,
    shouldRespond: shouldAgentRespond,
    enqueueReply,
    sendReply,
    now: () => new Date("2026-10-27T12:00:00Z"),
    ...overrides,
  } as MetaWebhookJobDeps;

  return { deps, webhookEvents, enqueueReply, markOptOut, sendReply, inbound, resolveSupplierByHandle };
}

describe("handleMetaWebhookJob", () => {
  it("DM normal (Instagram): resolve fornecedor e enfileira a resposta", async () => {
    const { deps, enqueueReply, markOptOut, webhookEvents } = makeDeps();
    await handleMetaWebhookJob(
      { kind: "message", webhookEventId: "wh1", event: msg("m1", "instagram", "tem buffet para 100?") },
      deps,
    );
    expect(enqueueReply).toHaveBeenCalledTimes(1);
    expect(enqueueReply).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "c1",
        channel: "instagram",
        recipientId: "111",
        supplierId: "s1",
        category: "buffet",
      }),
    );
    expect(markOptOut).not.toHaveBeenCalled();
    expect(webhookEvents.updates).toEqual([{ externalEventId: "m1", status: "processed" }]);
  });

  it("opt-out determinístico: marca e NÃO enfileira resposta", async () => {
    const { deps, enqueueReply, markOptOut } = makeDeps({
      inbound: vi.fn(async () => ({
        action: { action: "opt_out" as const },
        conversation: { id: "c1", status: "opted_out" as const },
        recorded: true,
      })),
    });
    await handleMetaWebhookJob(
      { kind: "message", webhookEventId: "wh1", event: msg("m1", "instagram", "PARAR") },
      deps,
    );
    expect(markOptOut).toHaveBeenCalledWith(deps.respondDb, "c1", "s1");
    expect(enqueueReply).not.toHaveBeenCalled();
  });

  it("evento já processado: no-op", async () => {
    const { deps, enqueueReply, inbound, webhookEvents } = makeDeps();
    webhookEvents.statuses.set("m1", "processed");
    await handleMetaWebhookJob(
      { kind: "message", webhookEventId: "wh1", event: msg("m1", "instagram", "olá") },
      deps,
    );
    expect(inbound).not.toHaveBeenCalled();
    expect(enqueueReply).not.toHaveBeenCalled();
    expect(webhookEvents.updates).toHaveLength(0);
  });

  it("comentário com palavra-chave: envia private reply", async () => {
    const { deps, sendReply } = makeDeps({
      resolveSupplierByHandle: vi.fn(async () => ({ id: "s1", name: "Buffet da Ana", category: "buffet" })),
      inbound: vi.fn(async () => ({
        action: { action: "private_reply" as const, commentId: "c1" },
        conversation: { id: "c1", status: "awaiting_human" as const },
        recorded: true,
      })),
    });
    await handleMetaWebhookJob(
      { kind: "comment", webhookEventId: "wh1", event: comment("c1", "quero cotação") },
      deps,
    );
    expect(sendReply).toHaveBeenCalledTimes(1);
    expect(sendReply.mock.calls[0]?.[0]).toMatchObject({ commentId: "c1", igUserId: "ig-1" });
  });

  it("regressão: comentário no domingo é adiado antes de gravar/enviar (horário comercial)", async () => {
    const { OutsideBusinessHoursError } = await import("@/lib/outreach/business-defer");
    const { deps, sendReply, inbound, webhookEvents } = makeDeps({
      now: () => new Date("2026-11-01T14:00:00Z"),
      resolveSupplierByHandle: vi.fn(async () => ({ id: "s1", name: "Buffet da Ana", category: "buffet" })),
    });
    await expect(
      handleMetaWebhookJob({ kind: "comment", webhookEventId: "wh1", event: comment("c9", "quero cotação") }, deps),
    ).rejects.toBeInstanceOf(OutsideBusinessHoursError);
    expect(inbound).not.toHaveBeenCalled();
    expect(sendReply).not.toHaveBeenCalled();
    expect(webhookEvents.updates).toHaveLength(0);
  });

  it("comentário fora da janela de 7 dias não envia private reply", async () => {
    const { deps, sendReply } = makeDeps({
      resolveSupplierByHandle: vi.fn(async () => ({ id: "s1", name: "Buffet da Ana", category: "buffet" })),
      inbound: vi.fn(async () => ({
        action: { action: "private_reply" as const, commentId: "c1" },
        conversation: { id: "c1", status: "awaiting_human" as const },
        recorded: true,
      })),
    });
    await handleMetaWebhookJob(
      {
        kind: "comment",
        webhookEventId: "wh1",
        event: { ...comment("c1", "quero cotação"), createdTime: "2026-10-01T12:00:00.000Z" },
      },
      deps,
    );
    expect(sendReply).not.toHaveBeenCalled();
  });

  it("DM com referral de anúncio: ingere a conversa com janela ad_7d", async () => {
    const recording: SupplierConversationStore = {
      find: async () => null,
      upsert: async (input) => ({
        id: "sc1",
        channel: input.channel,
        externalUserId: input.externalUserId,
        eventId: input.eventId ?? null,
        supplierId: input.supplierId ?? null,
        ref: input.ref ?? null,
        lastInboundAt: input.lastInboundAt.toISOString(),
        windowExpiresAt: input.windowExpiresAt.toISOString(),
        windowKind: input.windowKind,
        status: input.status ?? "open",
      }),
      insertMessage: async () => true,
    };
    // Captura o input via interceptação do método upsert do store passado.
    const spy = vi.fn(recording.upsert);
    const store: SupplierConversationStore = { ...recording, upsert: spy };
    const { deps } = makeDeps({ supplierConversations: store });
    await handleMetaWebhookJob(
      {
        kind: "message",
        webhookEventId: "wh1",
        event: {
          ...msg("m1", "instagram", "olá"),
          referral: { ref: "event:aaaaaaaa-0000-4000-8000-000000000001", source: "ADS" },
        },
      },
      deps,
    );
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      windowKind: "ad_7d",
      ref: "event:aaaaaaaa-0000-4000-8000-000000000001",
      eventId: "aaaaaaaa-0000-4000-8000-000000000001",
    });
  });

  it("DM com o código do post de prospecção vincula a conversa ao evento", async () => {
    const recording: SupplierConversationStore = {
      find: async () => null,
      upsert: async (input) => ({
        id: "sc1",
        channel: input.channel,
        externalUserId: input.externalUserId,
        eventId: input.eventId ?? null,
        supplierId: input.supplierId ?? null,
        ref: input.ref ?? null,
        lastInboundAt: input.lastInboundAt.toISOString(),
        windowExpiresAt: input.windowExpiresAt.toISOString(),
        windowKind: input.windowKind,
        status: input.status ?? "open",
      }),
      insertMessage: async () => true,
    };
    const spy = vi.fn(recording.upsert);
    const store: SupplierConversationStore = { ...recording, upsert: spy };
    const eventUuid = "aaaaaaaa-0000-4000-8000-000000000001";
    const findEventIdByCode = vi.fn(async () => eventUuid);
    const { deps } = makeDeps({ supplierConversations: store, findEventIdByCode });

    await handleMetaWebhookJob(
      {
        kind: "message",
        webhookEventId: "wh1",
        event: msg("m1", "instagram", "tenho interesse, meu código é EVT-AAAAAAAA"),
      },
      deps,
    );

    expect(findEventIdByCode).toHaveBeenCalledWith("EVT-AAAAAAAA");
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ eventId: eventUuid });
  });

  it("referral tem prioridade sobre o código na mensagem", async () => {
    const eventUuid = "aaaaaaaa-0000-4000-8000-000000000001";
    const findEventIdByCode = vi.fn(async () => "outro-evento");
    const { deps } = makeDeps({ findEventIdByCode });

    await handleMetaWebhookJob(
      {
        kind: "message",
        webhookEventId: "wh1",
        event: {
          ...msg("m1", "instagram", "código EVT-AAAAAAAA"),
          referral: { ref: `event:${eventUuid}`, source: "SHORTLINK" },
        },
      },
      deps,
    );

    expect(findEventIdByCode).not.toHaveBeenCalled();
  });

  it("erros durante o processamento propagam para o BullMQ repetir", async () => {
    const { deps } = makeDeps({
      enqueueReply: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await expect(
      handleMetaWebhookJob(
        { kind: "message", webhookEventId: "wh1", event: msg("m1", "instagram", "olá") },
        deps,
      ),
    ).rejects.toThrow("boom");
  });
});
