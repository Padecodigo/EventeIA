import { describe, expect, it } from "vitest";

import { contingencySupplierReply } from "@/lib/ai/contingency";
import {
  buildSupplierReplyMessages,
  formatEventDate,
  IDENTITY_PHRASE,
  sanitizeSupplierReply,
  shouldDraftReply,
  supplierReplySchema,
} from "@/lib/quotes/triage";

const context = {
  eventTitle: "Festa da Lia",
  eventType: "festa_infantil",
  eventDateIso: "2026-12-05",
  city: "Taubaté",
  guestCount: 40,
  categoryLabel: "buffet",
  vendorName: "Buffet Sabor",
};

describe("triagem da resposta do fornecedor", () => {
  it("só redige quando há pergunta e ainda não há valor aproveitável", () => {
    expect(
      shouldDraftReply({ usable: false, unavailable: false, intent: "needs_info", questions: 2 }),
    ).toBe(true);
    expect(
      shouldDraftReply({ usable: true, unavailable: false, intent: "needs_info", questions: 2 }),
    ).toBe(false);
    expect(
      shouldDraftReply({ usable: false, unavailable: true, intent: "needs_info", questions: 1 }),
    ).toBe(false);
    expect(
      shouldDraftReply({ usable: false, unavailable: false, intent: "decline", questions: 1 }),
    ).toBe(false);
    expect(
      shouldDraftReply({ usable: false, unavailable: false, intent: "later", questions: 1 }),
    ).toBe(false);
    expect(
      shouldDraftReply({ usable: false, unavailable: false, intent: "needs_info", questions: 0 }),
    ).toBe(false);
  });

  it("prompt leva contexto, identidade e texto como dado não confiável", () => {
    const messages = buildSupplierReplyMessages("Qual a data?", context, ["Qual a data?"]);
    const all = messages.map((message) => message.content).join("\n");
    expect(all).toContain(IDENTITY_PHRASE);
    expect(all).toContain("Festa da Lia");
    expect(all).toContain("Taubaté");
    expect(all).toContain("<m>Qual a data?</m>");
    expect(all).toContain("NÃO CONFIÁVEL");
    expect(all).not.toContain("http");
  });

  it("sanitiza URL/SAIR e limita o tamanho", () => {
    expect(sanitizeSupplierReply("Oi! Veja https://x.com e responda SAIR")).toBe(
      "Oi! Veja e responda",
    );
    expect(sanitizeSupplierReply(null)).toBeNull();
    expect(sanitizeSupplierReply("   ")).toBeNull();
    expect(sanitizeSupplierReply("a".repeat(900))?.length).toBe(600);
  });

  it("contingência usa só o contexto do evento e valida no schema", () => {
    const reply = contingencySupplierReply(context);
    expect(supplierReplySchema.safeParse(reply).success).toBe(true);
    expect(reply.kind).toBe("question");
    expect(reply.reply).toContain("Festa da Lia");
    expect(reply.reply).toContain(formatEventDate("2026-12-05"));
    expect((reply.reply ?? "").toLowerCase()).toContain(IDENTITY_PHRASE.toLowerCase());
  });
});
