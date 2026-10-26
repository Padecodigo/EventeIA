import { describe, expect, it } from "vitest";

import {
  canRecontact,
  categoryNeed,
  collectionEnded,
  localDateKey,
  msUntilBusinessHours,
  renderDiscoveryFirstContact,
  shouldAutoPause,
  supplierCandidateSchema,
} from "@/lib/discovery/pure";
import { extractBrazilPhones, parseBrazilPhone } from "@/lib/phone";
import { firstContactMessageSchema } from "@/lib/schemas/whatsapp";

describe("telefone BR / DDD", () => {
  it("aceita celular com DDD válido e normaliza E.164", () => {
    expect(parseBrazilPhone("(12) 99123-4567")?.e164).toBe("+5512991234567");
    expect(parseBrazilPhone("+55 12 3622-1234")?.e164).toBe("+551236221234");
  });
  it("rejeita DDD inexistente, celular sem 9 e dígitos repetidos", () => {
    expect(parseBrazilPhone("(20) 99123-4567")).toBeNull();
    expect(parseBrazilPhone("(12) 81234-5678")).toBeNull();
    expect(parseBrazilPhone("(12) 99999-9999")).toBeNull();
  });
  it("extrai de links wa.me marcando como WhatsApp", () => {
    const found = extractBrazilPhones("fale https://wa.me/5512991234567 ou tel: (12) 3622-1234");
    expect(found[0]).toMatchObject({ viaWhatsappLink: true });
    expect(found.map((f) => f.phone.e164)).toContain("+551236221234");
  });
});

describe("regras de coleta", () => {
  const start = new Date("2026-10-20T12:00:00Z");
  it("encerra em 24h ou com 5 orçamentos em todas as categorias", () => {
    expect(
      collectionEnded({
        startedAt: start,
        now: new Date(start.getTime() + 24 * 3600_000),
        categories: ["buffet"],
        quotesByCategory: {},
      }),
    ).toEqual({ ended: true, reason: "time" });
    expect(
      collectionEnded({
        startedAt: start,
        now: start,
        categories: ["buffet", "dj"],
        quotesByCategory: { buffet: 5, dj: 5 },
      }).reason,
    ).toBe("quotes");
    expect(
      collectionEnded({
        startedAt: start,
        now: start,
        categories: ["buffet", "dj"],
        quotesByCategory: { buffet: 5 },
      }).ended,
    ).toBe(false);
  });
  it("tetos permitem atingir 5 orçamentos por categoria", () => {
    expect(categoryNeed({ quotes: 0, prospects: 0, eventProspects: 0 })).toBe(5);
    expect(categoryNeed({ quotes: 5, prospects: 0, eventProspects: 0 })).toBe(0);
    expect(categoryNeed({ quotes: 0, prospects: 12, eventProspects: 0 })).toBe(0);
    expect(categoryNeed({ quotes: 0, prospects: 0, eventProspects: 120 })).toBe(0);
  });
  it("recontato mínimo de 15 dias", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    expect(canRecontact(null, now)).toBe(true);
    expect(canRecontact(new Date(now.getTime() - 14 * 86_400_000), now)).toBe(false);
    expect(canRecontact(new Date(now.getTime() - 15 * 86_400_000), now)).toBe(true);
  });
  it("pausa automática com opt-out alto", () => {
    expect(shouldAutoPause({ contacted: 9, optOuts: 9 })).toBe(false);
    expect(shouldAutoPause({ contacted: 10, optOuts: 3 })).toBe(true);
    expect(shouldAutoPause({ contacted: 10, optOuts: 2 })).toBe(false);
  });
  it("contato só em dia útil 9–18h de Brasília", () => {
    expect(msUntilBusinessHours(new Date("2026-10-23T13:00:00Z"))).toBe(0); // sex 10h SP
    expect(msUntilBusinessHours(new Date("2026-10-23T21:30:00Z"))).toBeGreaterThan(0); // sex 18h30 SP
    // Regressão: sábado 10h antes era liberado; agora adia até segunda 9h.
    expect(msUntilBusinessHours(new Date("2026-10-24T13:00:00Z"))).toBe(
      Date.parse("2026-10-26T12:00:00Z") - Date.parse("2026-10-24T13:00:00Z"),
    );
    expect(localDateKey(new Date("2026-10-25T01:00:00Z"))).toBe("2026-10-24");
  });
});

describe("primeiro contato da descoberta", () => {
  it("traz detalhes do evento e origem, sem rodapé de opt-out, e passa no schema", () => {
    const text = renderDiscoveryFirstContact({
      vendorName: "Buffet Sabor",
      category: "buffet",
      eventTypeLabel: "Casamento",
      eventDateIso: "2026-12-12",
      city: "Taubaté",
      guestCount: 120,
      items: [{ label: "Buffet completo", quantity: 120, unit: "por_pessoa" }],
      sourceProvider: "grok",
    });
    expect(text).toContain("Taubaté");
    expect(text).toContain("120");
    expect(text).toMatch(/internet/);
    expect(text).toContain("Aqui é da EventeIA.");
    expect(text).toContain("orçamento de buffet");
    expect(text).not.toContain("SAIR");
    expect(firstContactMessageSchema.safeParse(text).success).toBe(true);
  });
  it("candidato exige source_url válida", () => {
    expect(
      supplierCandidateSchema.safeParse({ name: "X Festas", category: "dj", sourceUrl: "nao-url" })
        .success,
    ).toBe(false);
  });
});
