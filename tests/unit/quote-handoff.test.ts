import { describe, expect, it } from "vitest";

import {
  CONTACT_HANDOFF_CONSENT_VERSION,
  buildHandoffContact,
  contactHandoffFallbackUrl,
  contactHandoffConsentText,
  isContactHandoffConsentValid,
  normalizeInstagramHandle,
  normalizePublicEmail,
  planContactHandoff,
  renderContactHandoffMessage,
} from "@/lib/quotes/handoff";

const MONDAY_11H = new Date("2026-10-26T14:00:00.000Z");
const SATURDAY_11H = new Date("2026-10-31T14:00:00.000Z");

const conversation = {
  id: "c1",
  channel: "instagram" as const,
  externalUserId: "igsid-1",
  status: "open" as const,
  windowExpiresAt: "2026-10-26T15:00:00.000Z",
};

describe("repasse de contato — consentimento LGPD", () => {
  it("tem texto explícito, específico do fornecedor e versionado", () => {
    const text = contactHandoffConsentText("Buffet Sabor");
    expect(text).toContain("Buffet Sabor");
    expect(text).toContain("Autorizo");
    expect(text).toContain("contato");
    expect(CONTACT_HANDOFF_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
  });

  it("só considera consentimento válido com aceite registrado", () => {
    expect(isContactHandoffConsentValid(null)).toBe(false);
    expect(isContactHandoffConsentValid({ acceptedAt: null })).toBe(false);
    expect(isContactHandoffConsentValid({ acceptedAt: "não-é-data" })).toBe(false);
    expect(isContactHandoffConsentValid({ acceptedAt: "2026-10-26T14:00:00.000Z" })).toBe(true);
  });

  it("monta contato somente com campos preenchidos", () => {
    const contact = buildHandoffContact({
      displayName: "Ana Anfitriã",
      email: "ANA@EXEMPLO.COM",
      phone: "+5511988887777",
      whatsapp: null,
      instagramHandle: "@ana.anfitria",
    });
    expect(contact).toEqual({
      name: "Ana Anfitriã",
      email: "ana@exemplo.com",
      phone: "+5511988887777",
      whatsapp: null,
      instagramHandle: "ana.anfitria",
    });
  });

  it("mensagem ao fornecedor inclui nome e contatos autorizados", () => {
    const text = renderContactHandoffMessage({
      vendorName: "Buffet Sabor",
      eventTitle: "Festa da Lia",
      optionName: "Pacote ouro",
      contact: buildHandoffContact({
        displayName: "Ana Anfitriã",
        email: "ana@exemplo.com",
        phone: "+5511988887777",
        whatsapp: "+5511999998888",
        instagramHandle: "ana.anfitria",
      }),
    });
    expect(text).toContain("Buffet Sabor");
    expect(text).toContain("Festa da Lia");
    expect(text).toContain("Pacote ouro");
    expect(text).toContain("Ana Anfitriã");
    expect(text).toContain("ana@exemplo.com");
    expect(text).toContain("+5511988887777");
    expect(text).toContain("+5511999998888");
    expect(text).toContain("@ana.anfitria");
    expect(text).toContain("consentimento LGPD");
  });
});

describe("repasse de contato — canais e janelas", () => {
  it("normaliza e-mail e handle sem confundir telefone com @", () => {
    expect(normalizePublicEmail("Contato@Buffet.com")).toBe("contato@buffet.com");
    expect(normalizePublicEmail("(11) 99999-9999")).toBeNull();
    expect(normalizeInstagramHandle("@Buffet.Sabor")).toBe("buffet.sabor");
    expect(normalizeInstagramHandle("https://instagram.com/buffet_sabor")).toBe("buffet_sabor");
    expect(normalizeInstagramHandle("(11) 99999-9999")).toBeNull();
  });

  it("usa IG/Messenger quando a janela está aberta em horário comercial", () => {
    const plan = planContactHandoff({
      now: MONDAY_11H,
      eventId: "e1",
      conversation,
      supplierEmail: "contato@buffet.com",
      supplierHandle: "buffet",
    });
    expect(plan).toEqual({ mode: "meta", conversation });
  });

  it("cai para o e-mail público fora da janela (em horário comercial)", () => {
    const plan = planContactHandoff({
      now: MONDAY_11H,
      eventId: "e1",
      conversation: { ...conversation, windowExpiresAt: "2026-10-26T13:00:00.000Z" },
      supplierEmail: "contato@buffet.com",
      supplierHandle: "buffet",
    });
    expect(plan).toEqual({ mode: "email", to: "contato@buffet.com" });
  });

  it("gera link ig.me quando não há janela nem e-mail", () => {
    const plan = planContactHandoff({
      now: MONDAY_11H,
      eventId: "e1",
      conversation: { ...conversation, status: "canal_fechado" },
      supplierEmail: null,
      supplierHandle: "@buffet_sabor",
    });
    expect(plan.mode).toBe("link");
    if (plan.mode !== "link") throw new Error("esperava link");
    expect(plan.url).toBe("https://ig.me/m/buffet_sabor?ref=event%3Ae1");
  });

  it("opt-out não é contornado por e-mail nem por link", () => {
    const plan = planContactHandoff({
      now: MONDAY_11H,
      eventId: "e1",
      conversation: { ...conversation, status: "opted_out" },
      supplierEmail: "contato@buffet.com",
      supplierHandle: "buffet",
    });
    expect(plan).toEqual({ mode: "unavailable", reason: "opted_out" });
  });

  it("fora do horário comercial não envia e-mail; usa o link", () => {
    const plan = planContactHandoff({
      now: SATURDAY_11H,
      eventId: "e1",
      conversation: { ...conversation, status: "canal_fechado" },
      supplierEmail: "contato@buffet.com",
      supplierHandle: "buffet",
    });
    expect(plan.mode).toBe("link");
  });

  it("sem canal e sem handle fica indisponível", () => {
    expect(contactHandoffFallbackUrl({ eventId: "e1", supplierHandle: null })).toBeNull();
    expect(
      planContactHandoff({
        now: MONDAY_11H,
        eventId: "e1",
        conversation: null,
        supplierEmail: null,
        supplierHandle: null,
      }),
    ).toEqual({ mode: "unavailable", reason: "sem_canal" });
  });
});
