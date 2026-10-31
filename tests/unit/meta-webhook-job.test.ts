import { describe, expect, it, vi } from "vitest";

import {
  handleMetaWebhookJob,
  type MetaWebhookJobDeps,
} from "@/lib/jobs/meta-webhook";
import type { MetaCommentEvent, MetaInboundMessage } from "@/lib/meta/webhook";
import type { MetaSupplierLookup } from "@/lib/meta/resolve";
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
  return { source, eventId, senderId, recipientId: "1784", text };
}

function comment(commentId: string, text: string, senderUsername = "buffet_da_ana"): MetaCommentEvent {
  return { commentId, text, senderId: "u1", senderUsername, mediaId: null };
}

function makeDeps(overrides: Partial<MetaWebhookJobDeps> = {}) {
  const webhookEvents = fakeWebhookEvents();
  const respond = vi.fn(async () => ({ action: "replied" as const, sent: true }));
  const markOptOut = vi.fn(async () => undefined);
  const sendReply = vi.fn(async (_input: unknown) => ({ ok: true as const, id: "m" }));
  const inbound = vi.fn(async () => ({
    action: { action: "open_conversation" as const, messageId: "m1" },
    conversation: { id: "c1", status: "awaiting_human" as const },
    recorded: true,
  }));
  const resolveSupplier = vi.fn(async () => ({ id: "s1", name: "Buffet da Ana", category: "buffet" }));
  const resolveSupplierByHandle = vi.fn(async () => null);
  const loadHistory = vi.fn(async () => []);

  const deps = {
    env: { keyword: "cotação", accessToken: "tok", igBusinessId: "ig-1", pageId: "pg-1" },
    store: noopStore(),
    respondDb: {} as RespondDb,
    lookup: {} as MetaSupplierLookup,
    webhookEvents: webhookEvents.db,
    resolveSupplier,
    resolveSupplierByHandle,
    inbound,
    markOptOut,
    shouldRespond: shouldAgentRespond,
    loadHistory,
    respond,
    getClient: () => ({ mode: "mock" as const, complete: async () => "{}" }),
    buildPorts: () => ({
      sendReply: async () => undefined,
      saveQuote: async () => undefined,
      markOptOut: async () => undefined,
      escalate: async () => undefined,
    }),
    sendReply,
    now: () => new Date("2026-10-27T12:00:00Z"),
    ...overrides,
  } as MetaWebhookJobDeps;

  return { deps, webhookEvents, respond, markOptOut, sendReply, inbound, resolveSupplierByHandle };
}

describe("handleMetaWebhookJob", () => {
  it("DM normal (Instagram): resolve fornecedor e responde", async () => {
    const { deps, respond, markOptOut, webhookEvents } = makeDeps();
    await handleMetaWebhookJob(
      { kind: "message", webhookEventId: "wh1", event: msg("m1", "instagram", "tem buffet para 100?") },
      deps,
    );
    expect(respond).toHaveBeenCalledTimes(1);
    expect(markOptOut).not.toHaveBeenCalled();
    expect(webhookEvents.updates).toEqual([{ externalEventId: "m1", status: "processed" }]);
  });

  it("opt-out determinístico: marca e NÃO responde", async () => {
    const { deps, respond, markOptOut } = makeDeps({
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
    expect(respond).not.toHaveBeenCalled();
  });

  it("evento já processado: no-op", async () => {
    const { deps, respond, inbound, webhookEvents } = makeDeps();
    webhookEvents.statuses.set("m1", "processed");
    await handleMetaWebhookJob(
      { kind: "message", webhookEventId: "wh1", event: msg("m1", "instagram", "olá") },
      deps,
    );
    expect(inbound).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
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

  it("erros durante o processamento propagam para o BullMQ repetir", async () => {
    const { deps } = makeDeps({
      respond: vi.fn(async () => {
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
