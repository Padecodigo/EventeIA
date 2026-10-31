import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, fakeClient, type FakeDb } from "./helpers/fake-supabase";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

const USER = { id: "b2222222-2222-4222-8222-222222222222", email: "ana@teste.com" };
const ADMIN = { id: "a1111111-1111-4111-8111-111111111111", email: "admin@teste.com" };
const EVENT = "e1111111-1111-4111-8111-111111111111";
const OTHER_EVENT = "e2222222-2222-4222-8222-222222222222";
const CONVERSATION = "c1111111-1111-4111-8111-111111111111";

let db: FakeDb;
let sessionUser: { id: string; email: string } | null = null;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (sessionUser === null) throw new Error("NEXT_REDIRECT /entrar");
    return sessionUser;
  },
  requireAdmin: async () => {
    if (sessionUser?.id !== ADMIN.id) throw new Error("NEXT_REDIRECT /painel");
    return sessionUser;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fakeClient(db),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => fakeClient(db),
}));
vi.mock("@/lib/outreach/chat-runtime", () => ({
  sendChatToSupplier: (input: unknown) => sendMock(input),
}));

const { sendEventChatMessageAction } = await import(
  "@/app/(dashboard)/eventos/[id]/chat-actions"
);
const { adminSendEventChatMessageAction } = await import(
  "@/app/admin/eventos/[id]/chat-actions"
);

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION,
    event_id: EVENT,
    supplier_id: null,
    channel: "instagram" as const,
    external_user_id: "igsid-1",
    status: "open" as const,
    window_expires_at: "2026-11-30T14:00:00.000Z",
    last_inbound_at: "2026-10-26T13:00:00.000Z",
    updated_at: "2026-10-26T13:00:00.000Z",
    ...overrides,
  };
}

function seed(conversationOverrides: Record<string, unknown> = {}) {
  db = createFakeDb({
    events: [
      { id: EVENT, status: "active", owner_profile_id: USER.id },
      { id: OTHER_EVENT, status: "active", owner_profile_id: USER.id },
    ],
    supplier_conversations: [conversation(conversationOverrides)],
    supplier_conversation_messages: [],
  });
  sendMock.mockReset();
  sendMock.mockResolvedValue({ ok: true, messageId: "mid-out-1" });
}

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.append(key, value);
  return fd;
}

beforeEach(() => {
  sessionUser = USER;
  seed();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T14:00:00Z")); // segunda-feira, 11h em Brasília
});

afterEach(() => {
  vi.useRealTimers();
});

describe("chat mediado do evento — server actions", () => {
  it("envia dentro da janela, grava a mensagem e relaya ao fornecedor", async () => {
    const result = await sendEventChatMessageAction(
      {},
      form({ eventId: EVENT, conversationId: CONVERSATION, body: "Podemos fechar o buffet?" }),
    );

    expect(result).toEqual({ ok: true, masked: false });
    expect(sendMock).toHaveBeenCalledWith({
      channel: "instagram",
      recipientId: "igsid-1",
      text: "Podemos fechar o buffet?",
    });
    const messages = db.tables.supplier_conversation_messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      conversation_id: CONVERSATION,
      direction: "out",
      author: "user",
      body: "Podemos fechar o buffet?",
      moderated: false,
      external_id: "mid-out-1",
    });
  });

  it("remove telefone, e-mail e link antes de relayar", async () => {
    const result = await sendEventChatMessageAction(
      {},
      form({
        eventId: EVENT,
        conversationId: CONVERSATION,
        body: "Meu zap é (11) 99999-9999, e-mail ana@exemplo.com, site www.buffet.com",
      }),
    );

    expect(result).toEqual({ ok: true, masked: true });
    const sent = sendMock.mock.calls[0]?.[0] as { text: string };
    expect(sent.text).not.toContain("99999");
    expect(sent.text).not.toContain("ana@exemplo.com");
    expect(sent.text).not.toContain("www.buffet.com");
    expect(sent.text).toContain("[contato removido]");
    expect(db.tables.supplier_conversation_messages?.[0]?.moderated).toBe(true);
  });

  it("janela vencida: não envia, fecha a conversa e oferece seguir com outros fornecedores", async () => {
    seed({ window_expires_at: "2026-10-26T13:00:00.000Z" });

    const result = await sendEventChatMessageAction(
      {},
      form({ eventId: EVENT, conversationId: CONVERSATION, body: "Oi" }),
    );

    expect(result.closed).toBe(true);
    expect(result.error).toContain("outros fornecedores");
    expect(sendMock).not.toHaveBeenCalled();
    expect(db.tables.supplier_conversations?.[0]?.status).toBe("canal_fechado");
    expect(db.tables.supplier_conversation_messages ?? []).toHaveLength(0);
  });

  it("opt-out não é sobrescrito com canal_fechado", async () => {
    seed({ status: "opted_out" });

    const result = await sendEventChatMessageAction(
      {},
      form({ eventId: EVENT, conversationId: CONVERSATION, body: "Oi" }),
    );

    expect(result.closed).toBe(true);
    expect(db.tables.supplier_conversations?.[0]?.status).toBe("opted_out");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("resposta digitada pelo usuário pode sair fora do horário comercial (janela aberta)", async () => {
    vi.setSystemTime(new Date("2026-10-31T14:00:00Z")); // sábado, mas janela aberta

    const result = await sendEventChatMessageAction(
      {},
      form({ eventId: EVENT, conversationId: CONVERSATION, body: "Oi" }),
    );

    expect(result).toEqual({ ok: true, masked: false });
    expect(sendMock).toHaveBeenCalledOnce();
    expect(db.tables.supplier_conversations?.[0]?.status).toBe("open");
  });

  it("automação/agente fora do horário comercial: bloqueia sem fechar a conversa", async () => {
    sessionUser = ADMIN;
    vi.setSystemTime(new Date("2026-10-31T14:00:00Z")); // sábado

    const result = await adminSendEventChatMessageAction(
      {},
      form({ conversationId: CONVERSATION, body: "Sou da EventeIA" }),
    );

    expect(result.closed).toBe(false);
    expect(result.error).toContain("dias úteis");
    expect(sendMock).not.toHaveBeenCalled();
    expect(db.tables.supplier_conversations?.[0]?.status).toBe("open");
  });

  it("não deixa responder conversa de outro evento", async () => {
    seed({ event_id: OTHER_EVENT });

    const result = await sendEventChatMessageAction(
      {},
      form({ eventId: EVENT, conversationId: CONVERSATION, body: "Oi" }),
    );

    expect(result.error).toBe("Conversa não encontrada.");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("agente (admin) intervém na conversa e a mensagem é marcada como agent", async () => {
    sessionUser = ADMIN;

    const result = await adminSendEventChatMessageAction(
      {},
      form({ conversationId: CONVERSATION, body: "Sou da EventeIA, posso ajudar?" }),
    );

    expect(result).toEqual({ ok: true, masked: false });
    expect(sendMock).toHaveBeenCalledWith({
      channel: "instagram",
      recipientId: "igsid-1",
      text: "Sou da EventeIA, posso ajudar?",
    });
    expect(db.tables.supplier_conversation_messages?.[0]).toMatchObject({
      author: "agent",
      direction: "out",
      body: "Sou da EventeIA, posso ajudar?",
    });
  });
});
