import { describe, expect, it, vi } from "vitest";

import { handleMetaWebhookJob, type MetaWebhookJobDeps } from "@/lib/jobs/meta-webhook";
import type { MetaInboundMessage } from "@/lib/meta/webhook";
import { createMockEmailAdapter, type EmailMessage } from "@/lib/notifications/email";
import { createMemoryThrottle, notifyOwnerOfSupplierReply } from "@/lib/outreach/owner-notify";
import type { SupplierConversationStore } from "@/lib/outreach/supplier-conversations";
import { shouldAgentRespond } from "@/lib/prospecting/respond";

/**
 * Fluxo: DM do fornecedor (IG/Messenger) → gravada em supplier_conversation_messages
 * → e-mail ao dono, com anti-spam e sem duplicar em reentrega do webhook.
 */

function store(): SupplierConversationStore & { seen: Set<string> } {
  const seen = new Set<string>();
  return {
    seen,
    find: () => Promise.resolve(null),
    upsert: (input) =>
      Promise.resolve({
        id: `sc-${input.channel}-${input.externalUserId}`,
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
    insertMessage: (m) => {
      // Dedup por external_id, como a constraint única do banco.
      if (seen.has(m.externalId ?? "")) return Promise.resolve(false);
      seen.add(m.externalId ?? "");
      return Promise.resolve(true);
    },
  };
}

function deps(sent: EmailMessage[], overrides: Partial<MetaWebhookJobDeps> = {}): MetaWebhookJobDeps {
  const throttle = createMemoryThrottle(() => 0);
  const webhookEvents = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
  };
  return {
    env: { keyword: "cotação", accessToken: "tok", igBusinessId: "ig-1", pageId: "pg-1" },
    store: {
      findConversation: () => Promise.resolve(null),
      createConversation: () => Promise.resolve({ id: "c1", status: "open" }),
      insertMessage: () => Promise.resolve(true),
      updateConversation: () => Promise.resolve(undefined),
    },
    respondDb: {} as never,
    lookup: {} as never,
    webhookEvents: webhookEvents as never,
    supplierConversations: store(),
    resolveSupplier: vi.fn(() => Promise.resolve({ id: "s1", name: "Buffet", category: "buffet" })),
    resolveSupplierByHandle: vi.fn(() => Promise.resolve(null)),
    inbound: vi.fn(() =>
      Promise.resolve({
        action: { action: "open_conversation" as const, messageId: "m" },
        conversation: { id: "c1", status: "awaiting_human" as const },
        recorded: true,
      }),
    ) as never,
    markOptOut: vi.fn(() => Promise.resolve(undefined)) as never,
    shouldRespond: shouldAgentRespond,
    enqueueReply: vi.fn(() => Promise.resolve(true)),
    sendReply: vi.fn() as never,
    now: () => new Date("2026-10-27T12:00:00Z"),
    notifyOwner: (notice) =>
      notifyOwnerOfSupplierReply(
        { to: "dono@eventeia.com.br", throttleMinutes: 30, email: createMockEmailAdapter(sent), throttle, appUrl: "https://eventeia.com.br" },
        notice,
      ),
    ...overrides,
  };
}

const dm = (id: string, source: "instagram" | "messenger", text: string): MetaInboundMessage => ({
  source,
  eventId: id,
  senderId: "111",
  recipientId: "1784",
  text,
  referral: { ref: "event:aaaaaaaa-0000-4000-8000-000000000001", source: null },
});

describe("webhook Meta → aviso ao dono", () => {
  it("DM do Instagram gravada dispara 1 e-mail com o evento vinculado", async () => {
    const sent: EmailMessage[] = [];
    await handleMetaWebhookJob({ kind: "message", webhookEventId: "w1", event: dm("m1", "instagram", "Temos data livre") }, deps(sent));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain("/admin/eventos/aaaaaaaa-0000-4000-8000-000000000001");
  });

  it("DM do Messenger também avisa", async () => {
    const sent: EmailMessage[] = [];
    await handleMetaWebhookJob({ kind: "message", webhookEventId: "w1", event: dm("m1", "messenger", "Oi") }, deps(sent));
    expect(sent[0]?.subject).toContain("Messenger");
  });

  it("regressão: reentrega do mesmo evento e rajada não geram e-mails repetidos", async () => {
    const sent: EmailMessage[] = [];
    const d = deps(sent);
    await handleMetaWebhookJob({ kind: "message", webhookEventId: "w1", event: dm("m1", "instagram", "1") }, d);
    await handleMetaWebhookJob({ kind: "message", webhookEventId: "w1", event: dm("m1", "instagram", "1") }, d);
    await handleMetaWebhookJob({ kind: "message", webhookEventId: "w2", event: dm("m2", "instagram", "2") }, d);
    expect(sent).toHaveLength(1);
  });

  it("falha no aviso não derruba o processamento do webhook", async () => {
    const sent: EmailMessage[] = [];
    const d = deps(sent, { notifyOwner: () => Promise.reject(new Error("redis fora")) });
    await expect(
      handleMetaWebhookJob({ kind: "message", webhookEventId: "w1", event: dm("m1", "instagram", "x") }, d),
    ).resolves.not.toThrow();
  });
});
