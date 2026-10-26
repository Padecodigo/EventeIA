import { describe, expect, it } from "vitest";

import { renderDiscoveryFirstContact } from "@/lib/discovery/pure";
import {
  firstContactPayloadSchema,
  prospectingJobSchema,
  renderFirstContact,
} from "@/lib/schemas/whatsapp";

describe("fluxo de primeiro contato (descoberta → job → payload Evolution)", () => {
  it("mensagem da descoberta passa pelo job e pelo payload estrito", () => {
    const messageText = renderDiscoveryFirstContact({
      vendorName: "Buffet Sabor",
      category: "buffet",
      eventTypeLabel: "Casamento",
      eventDateIso: "2026-12-12",
      city: "Campinas",
      guestCount: 120,
      items: [
        {
          label: "Buffet de jantar completo",
          quantity: 120,
          unit: "por_pessoa",
          notes: "opção vegetariana",
        },
      ],
      sourceProvider: "grok",
      now: new Date("2026-10-24T19:00:00Z"), // 16h SP
    });
    expect(messageText).toMatch(/^Boa tarde, tudo bem\? Aqui é da EventeIA\./);
    expect(messageText).toContain("Estamos fazendo um levantamento de orçamentos.");
    expect(messageText).not.toContain("SAIR");
    expect(messageText).toContain("o cardápio, o valor por pessoa e a equipe");
    expect(messageText).toContain("opção vegetariana");
    const job = prospectingJobSchema.parse({
      prospectId: "00000000-0000-4000-8000-000000000001",
      eventId: "00000000-0000-4000-8000-000000000002",
      instance: "inst-1",
      phoneE164: "+5519999999999",
      vendorName: "Buffet Sabor",
      eventTitle: "Casamento A&B",
      eventType: "casamento",
      eventDateIso: "2026-12-12",
      city: "Campinas",
      guestCount: 120,
      category: "buffet",
      messageText,
    });
    const text = job.messageText ?? renderFirstContact(job);
    expect(firstContactPayloadSchema.safeParse({ number: job.phoneE164, text }).success).toBe(true);
  });
  it("fallback do worker (sem messageText) segue a mesma estrutura", () => {
    const text = renderFirstContact({
      vendorName: "DJ Max",
      eventTitle: "Festa",
      eventType: "festa_infantil",
      eventDateIso: "2026-12-05",
      city: "Taubaté",
      guestCount: 40,
      category: "som_dj",
      now: new Date("2026-10-24T23:00:00Z"),
    });
    expect(text).toMatch(/^Boa noite, tudo bem\? Aqui é da EventeIA\. .*orçamento de som e DJ\./);
    expect(text).toContain("o repertório, a duração da apresentação e o equipamento de som");
    expect(text).toContain("uma festa infantil para 40 convidados em Taubaté");
    expect(text.endsWith("Estamos fazendo um levantamento de orçamentos.")).toBe(true);
  });
});
