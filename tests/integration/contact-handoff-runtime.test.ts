import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, fakeClient, type FakeDb } from "./helpers/fake-supabase";

const { sendMock, emailMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  emailMock: vi.fn(),
}));

let db: FakeDb;

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => fakeClient(db),
}));
vi.mock("@/lib/outreach/chat-runtime", () => ({
  sendChatToSupplier: (input: unknown) => sendMock(input),
}));
vi.mock("@/lib/notifications/email", () => ({
  getEmailAdapter: () => ({ mode: "mock", send: (input: unknown) => emailMock(input) }),
}));

const { deliverContactHandoff } = await import("@/lib/quotes/handoff-runtime");

const EVENT = "e1111111-1111-4111-8111-111111111111";
const QUOTATION = "q1111111-1111-4111-8111-111111111111";
const SUPPLIER = "s1111111-1111-4111-8111-111111111111";
const PROFILE = "p1111111-1111-4111-8111-111111111111";
const CONSENT = "h1111111-1111-4111-8111-111111111111";
const CONVERSATION = "c1111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-26T14:00:00.000Z"); // segunda, 11h em Brasília

const profile = {
  displayName: "Ana Anfitriã",
  email: "ana@exemplo.com",
  phone: "+5511988887777",
  whatsapp: "+5511999998888",
  instagramHandle: "ana.anfitria",
};

function consentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSENT,
    event_id: EVENT,
    quotation_id: QUOTATION,
    supplier_id: SUPPLIER,
    profile_id: PROFILE,
    consent_text: "Autorizo…",
    consent_version: "2026-10-31-v1",
    accepted_at: "2026-10-26T13:59:00.000Z",
    delivery_status: "consentido",
    delivery_channel: null,
    delivered_at: null,
    fallback_url: null,
    ...overrides,
  };
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION,
    event_id: EVENT,
    supplier_id: SUPPLIER,
    channel: "instagram",
    external_user_id: "igsid-1",
    status: "open",
    window_expires_at: "2026-10-26T15:00:00.000Z",
    last_inbound_at: "2026-10-26T13:00:00.000Z",
    ...overrides,
  };
}

function seed(overrides: {
  consents?: Record<string, unknown>[];
  conversation?: Record<string, unknown>;
  supplier?: Record<string, unknown>;
} = {}) {
  db = createFakeDb({
    contact_handoff_consents: overrides.consents ?? [consentRow()],
    suppliers: [
      { id: SUPPLIER, name: "Buffet Sabor", contact_email: "contato@buffet.com", ...overrides.supplier },
    ],
    supplier_conversations: [conversation(overrides.conversation)],
    supplier_conversation_messages: [],
    quotations: [{ id: QUOTATION, event_id: EVENT, status: "draft", repassado_at: null }],
  });
  sendMock.mockReset();
  emailMock.mockReset();
  sendMock.mockResolvedValue({ ok: true, messageId: "mid-handoff" });
  emailMock.mockResolvedValue({ id: "email-1" });
}

const request = {
  consentId: CONSENT,
  eventId: EVENT,
  quotationId: QUOTATION,
  supplierId: SUPPLIER,
  profileId: PROFILE,
  supplierName: "Buffet Sabor",
  supplierContact: "@buffet_sabor",
  eventTitle: "Festa da Lia",
  optionName: "Pacote ouro",
  profile,
  now: NOW,
};

describe("repasse de contato — runtime", () => {
  beforeEach(() => seed());

  it("sem consentimento registrado não envia nada e não grava mensagem ao fornecedor", async () => {
    seed({ consents: [] });

    await expect(deliverContactHandoff(request)).rejects.toThrow(/consentimento/);

    expect(sendMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
    expect(db.tables.supplier_conversation_messages ?? []).toHaveLength(0);
    expect(db.tables.contact_handoff_consents ?? []).toHaveLength(0);
  });

  it("consentimento de outro fornecedor não autoriza o repasse", async () => {
    seed({ consents: [consentRow({ supplier_id: "s2222222-2222-4222-8222-222222222222" })] });

    await expect(deliverContactHandoff(request)).rejects.toThrow(/consentimento/);

    expect(sendMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
    expect(db.tables.supplier_conversation_messages ?? []).toHaveLength(0);
  });

  it("com consentimento e janela aberta, envia o contato no Instagram e marca repassado", async () => {
    const result = await deliverContactHandoff(request);

    expect(result.status).toBe("repassado");
    expect(result.channel).toBe("instagram");
    const sent = sendMock.mock.calls[0]?.[0] as { text: string };
    expect(sent.text).toContain("Ana Anfitriã");
    expect(sent.text).toContain("ana@exemplo.com");
    expect(sent.text).toContain("+5511988887777");
    expect(sent.text).toContain("Pacote ouro");

    const messages = db.tables.supplier_conversation_messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      conversation_id: CONVERSATION,
      direction: "out",
      author: "system",
      moderated: false,
    });
    expect(db.tables.quotations?.[0]).toMatchObject({ status: "repassado" });
    expect(db.tables.contact_handoff_consents?.[0]).toMatchObject({
      delivery_status: "repassado",
      delivery_channel: "instagram",
    });
  });

  it("janela fechada: usa o e-mail público e só então marca repassado", async () => {
    seed({ conversation: { window_expires_at: "2026-10-26T13:00:00.000Z" } });

    const result = await deliverContactHandoff(request);

    expect(result.status).toBe("repassado");
    expect(result.channel).toBe("email");
    expect(sendMock).not.toHaveBeenCalled();
    const email = emailMock.mock.calls[0]?.[0] as { to: string; text: string };
    expect(email.to).toBe("contato@buffet.com");
    expect(email.text).toContain("Ana Anfitriã");
    expect(db.tables.supplier_conversations?.[0]?.status).toBe("canal_fechado");
    expect(db.tables.quotations?.[0]).toMatchObject({ status: "repassado" });
  });

  it("opt-out bloqueia Meta e e-mail: nenhum contato é repassado", async () => {
    seed({ conversation: { status: "opted_out" } });

    const result = await deliverContactHandoff(request);

    expect(result.status).toBe("unavailable");
    expect(sendMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
    expect(db.tables.supplier_conversation_messages ?? []).toHaveLength(0);
    expect(db.tables.quotations?.[0]).toMatchObject({ status: "draft" });
    expect(db.tables.contact_handoff_consents?.[0]).toMatchObject({
      delivery_status: "indisponivel",
    });
  });

  it("sem janela e sem e-mail entrega link ig.me ao usuário", async () => {
    seed({
      conversation: { status: "canal_fechado" },
      supplier: { contact_email: null },
    });

    const result = await deliverContactHandoff(request);

    expect(result).toMatchObject({
      status: "link",
      channel: "link",
      fallbackUrl: "https://ig.me/m/buffet_sabor?ref=event%3Ae1111111-1111-4111-8111-111111111111",
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
    expect(db.tables.quotations?.[0]).toMatchObject({ status: "draft" });
  });
});
