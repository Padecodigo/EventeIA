import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, fakeClient, type FakeDb } from "./helpers/fake-supabase";

const { deliverMock, session } = vi.hoisted(() => ({
  deliverMock: vi.fn(),
  session: { user: null as { id: string; email: string } | null },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (session.user === null) throw new Error("NEXT_REDIRECT /entrar");
    return session.user;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fakeClient(db),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => fakeClient(db),
}));
vi.mock("@/lib/quotes/handoff-runtime", () => ({
  deliverContactHandoff: (input: unknown) => deliverMock(input),
}));

const { chooseQuotationOptionAction } = await import(
  "@/app/(dashboard)/eventos/[id]/choices-actions"
);

const USER = { id: "b2222222-2222-4222-8222-222222222222", email: "ana@teste.com" };
const EVENT = "e1111111-1111-4111-8111-111111111111";
const QUOTATION = "d1111111-1111-4111-8111-111111111111";
const SUPPLIER = "f1111111-1111-4111-8111-111111111111";

let db: FakeDb;

function seed() {
  db = createFakeDb({
    events: [
      {
        id: EVENT,
        title: "Festa da Lia",
        owner_profile_id: USER.id,
        status: "active",
        workspace_id: null,
      },
    ],
    quotations: [
      {
        id: QUOTATION,
        event_id: EVENT,
        supplier_id: SUPPLIER,
        vendor_name: "Buffet Sabor",
        vendor_contact: "@buffet_sabor",
        status: "draft",
        amount_cents: 450000,
        fees_cents: 0,
        confidence: 0.9,
        needs_followup: false,
        extraction: {
          quotation: {
            options: [
              { name: "Pacote prata", amount_cents: 450000, includes: ["buffet"] },
              { name: "Pacote ouro", amount_cents: 650000 },
            ],
          },
        },
      },
    ],
    profiles: [
      {
        id: USER.id,
        display_name: "Ana Anfitriã",
        email: "ana@exemplo.com",
        phone_e164: "+5511988887777",
        contact_whatsapp_e164: "+5511999998888",
        instagram_handle: "ana.anfitria",
      },
    ],
    quotation_choices: [],
    contact_handoff_consents: [],
    supplier_conversation_messages: [],
    system_events: [],
  });
  deliverMock.mockReset();
  deliverMock.mockResolvedValue({
    status: "repassado",
    channel: "instagram",
    fallbackUrl: null,
    message: "Escolha registrada: seu contato foi repassado ao fornecedor.",
  });
}

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.append(key, value);
  return fd;
}

beforeEach(() => {
  session.user = USER;
  seed();
});

describe("escolha da cotação — repasse de contato com consentimento", () => {
  it("sem consentimento salva a escolha e NÃO repassa nenhum contato", async () => {
    const result = await chooseQuotationOptionAction(
      {},
      form({ eventId: EVENT, quotationId: QUOTATION, optionIndex: "1" }),
    );

    expect(result).toMatchObject({ ok: true, relayed: false, handoffStatus: "sem_consent" });
    expect(deliverMock).not.toHaveBeenCalled();
    expect(db.tables.contact_handoff_consents ?? []).toHaveLength(0);
    expect(db.tables.supplier_conversation_messages ?? []).toHaveLength(0);
    expect(db.tables.quotation_choices ?? []).toHaveLength(1);

    // Regressão: o feed da escolha (antes do aceite) não carrega dados do usuário.
    const feed = (db.tables.system_events ?? []).map((row) => JSON.stringify(row)).join("\n");
    expect(feed).not.toContain("ana@exemplo.com");
    expect(feed).not.toContain("+5511988887777");
    expect(feed).not.toContain("ana.anfitria");
  });

  it("com consentimento registra o aceite (sem IP) antes de chamar o repasse", async () => {
    const result = await chooseQuotationOptionAction(
      {},
      form({ eventId: EVENT, quotationId: QUOTATION, optionIndex: "1", consent: "on" }),
    );

    expect(result).toMatchObject({ ok: true, relayed: true, handoffStatus: "repassado" });

    const consents = db.tables.contact_handoff_consents ?? [];
    expect(consents).toHaveLength(1);
    const consent = consents[0] as Record<string, unknown>;
    expect(consent).toMatchObject({
      event_id: EVENT,
      quotation_id: QUOTATION,
      supplier_id: SUPPLIER,
      profile_id: USER.id,
      consent_version: "2026-10-31-v1",
    });
    expect(String(consent.consent_text)).toContain("Buffet Sabor");
    expect(String(consent.consent_text)).toContain("Autorizo");
    expect(typeof consent.accepted_at).toBe("string");
    expect(consent).not.toHaveProperty("ip");
    expect(consent).not.toHaveProperty("ip_address");

    expect(deliverMock).toHaveBeenCalledTimes(1);
    const handoff = deliverMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(handoff).toMatchObject({
      consentId: consent.id,
      eventId: EVENT,
      quotationId: QUOTATION,
      supplierId: SUPPLIER,
      profileId: USER.id,
      supplierName: "Buffet Sabor",
      optionName: "Pacote ouro",
      profile: {
        displayName: "Ana Anfitriã",
        email: "ana@exemplo.com",
        phone: "+5511988887777",
        whatsapp: "+5511999998888",
        instagramHandle: "ana.anfitria",
      },
    });
  });

  it("devolve o link de fallback ao usuário quando o canal está fechado", async () => {
    deliverMock.mockResolvedValue({
      status: "link",
      channel: "link",
      fallbackUrl: "https://ig.me/m/buffet_sabor?ref=event%3Ae1111111-1111-4111-8111-111111111111",
      message: "O canal direto com este fornecedor está fechado agora.",
    });

    const result = await chooseQuotationOptionAction(
      {},
      form({ eventId: EVENT, quotationId: QUOTATION, optionIndex: "1", consent: "on" }),
    );

    expect(result).toMatchObject({
      ok: true,
      relayed: false,
      handoffStatus: "link",
      fallbackUrl: "https://ig.me/m/buffet_sabor?ref=event%3Ae1111111-1111-4111-8111-111111111111",
    });
  });
});
