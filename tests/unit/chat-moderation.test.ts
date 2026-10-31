import { describe, expect, it } from "vitest";

import { CONTACT_PLACEHOLDER, moderateContactInfo } from "@/lib/outreach/moderation";

describe("moderateContactInfo (chat mediado)", () => {
  it("remove e-mails", () => {
    const result = moderateContactInfo("Me chama em buffet.ana@exemplo.com.br por favor");
    expect(result.masked).toBe(true);
    expect(result.text).toBe(`Me chama em ${CONTACT_PLACEHOLDER} por favor`);
  });

  it("remove links com esquema, www e domínio sem esquema", () => {
    for (const contact of [
      "https://buffet-ana.com.br/orcamento",
      "www.buffet-ana.com",
      "buffet-ana.com.br/promo",
      "wa.me/5511999999999",
    ]) {
      const result = moderateContactInfo(`Segue o site ${contact}`);
      expect(result.masked, contact).toBe(true);
      expect(result.text, contact).not.toContain(contact);
      expect(result.text).toContain(CONTACT_PLACEHOLDER);
    }
  });

  it("remove @handles", () => {
    const result = moderateContactInfo("Nosso Instagram é @buffet_da_ana");
    expect(result.masked).toBe(true);
    expect(result.text).toBe(`Nosso Instagram é ${CONTACT_PLACEHOLDER}`);
  });

  it("remove telefones formatados, com +55 e só dígitos", () => {
    for (const phone of [
      "(11) 99999-9999",
      "11 9999-9999",
      "+55 11 99999-9999",
      "11999999999",
      "99999-9999",
    ]) {
      const result = moderateContactInfo(`Meu zap: ${phone}`);
      expect(result.masked, phone).toBe(true);
      expect(result.text, phone).not.toContain(phone);
    }
  });

  it("preserva preços, datas e texto sem contato", () => {
    const text = "O pacote custa R$ 1.500,00 e a data é 10/12/2026. Fechamos?";
    const result = moderateContactInfo(text);
    expect(result).toEqual({ text, masked: false });
  });

  it("texto sem contato não é alterado", () => {
    const result = moderateContactInfo("  Podemos fechar o buffet para 40 convidados.  ");
    expect(result).toEqual({ text: "Podemos fechar o buffet para 40 convidados.", masked: false });
  });

  it("é idempotente e colapsa placeholders repetidos", () => {
    const once = moderateContactInfo("ana@x.com 11 99999-9999");
    expect(once.masked).toBe(true);
    const twice = moderateContactInfo(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.masked).toBe(false);
    expect(once.text).toBe(CONTACT_PLACEHOLDER);
  });
});
