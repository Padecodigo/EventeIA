import { describe, expect, it } from "vitest";

import {
  detectOptOut,
  firstContactMessageSchema,
  normalizeReplyText,
  prospectingJobSchema,
  renderFirstContact,
} from "@/lib/schemas/whatsapp";
import {
  MAX_INTERVAL_SECONDS,
  MIN_INTERVAL_SECONDS,
  pickIntervalSeconds,
  resolveIntervalSeconds,
} from "@/lib/queue/prospecting-pacing";

/* ============================================================
 * Regra 2 — primeiro contato: texto puro
 * ============================================================ */

describe("firstContactMessageSchema", () => {
  const clean =
    "Olá, tudo bem? Gostaria de saber se você atende o meu evento. Podemos combinar um orçamento?";

  it("aceita texto puro válido", () => {
    expect(firstContactMessageSchema.parse(clean)).toBe(clean);
  });

  it("rejeita URLs", () => {
    expect(
      firstContactMessageSchema.safeParse(`${clean} Veja: https://eventeia.com`).success,
    ).toBe(false);
    expect(firstContactMessageSchema.safeParse(`${clean} acesse www.site.com`).success).toBe(
      false,
    );
  });

  it("rejeita emojis", () => {
    expect(firstContactMessageSchema.safeParse(`${clean} 🎉`).success).toBe(false);
  });

  it("rejeita curto, longo e pontuação excessiva", () => {
    expect(firstContactMessageSchema.safeParse("oi").success).toBe(false);
    expect(firstContactMessageSchema.safeParse(`${clean.repeat(10)}`).success).toBe(false);
    expect(firstContactMessageSchema.safeParse(`${clean}!!!`).success).toBe(false);
  });
});

describe("renderFirstContact", () => {
  it("monta mensagem de texto puro com os dados do evento", () => {
    const message = renderFirstContact({
      vendorName: "Buffet da Vila",
      eventTitle: "Festa de 5 anos da Lia",
      eventType: "festa_infantil",
      eventDateIso: "2026-12-05",
      city: "São José dos Campos",
      guestCount: 60,
    });

    expect(message).toContain("Buffet da Vila");
    expect(message).toContain("Festa de 5 anos da Lia");
    expect(message).toContain("São José dos Campos");
    expect(message).toContain("60 convidados");
    expect(message).not.toMatch(/https?:\/\//);
  });

  it("omite a cidade quando vazia (sem duplicar espaços)", () => {
    const message = renderFirstContact({
      vendorName: "Buffet",
      eventTitle: "Festa",
      eventType: "festa_infantil",
      eventDateIso: "2026-12-05",
      city: "",
      guestCount: 30,
    });

    expect(message).not.toContain("undefined");
    expect(message).toContain("30 convidados");
  });
});

/* ============================================================
 * Regra 3 — opt-out imediato
 * ============================================================ */

describe("detectOptOut", () => {
  it("detecta recusas com acentos, caps e pontuação", () => {
    expect(detectOptOut("SAIR")).toBe(true);
    expect(detectOptOut("não tenho interesse")).toBe(true);
    expect(detectOptOut("Parar, por favor!")).toBe(true);
    expect(detectOptOut("quero PARAR de receber")).toBe(true);
    expect(detectOptOut("descadastrar")).toBe(true);
  });

  it("'não' sozinho é recusa; 'não' dentro de frase maior não é", () => {
    expect(detectOptOut("não")).toBe(true);
    expect(detectOptOut("Não!")).toBe(true);
    expect(detectOptOut("não posso atender essa data, mas conheço quem possa")).toBe(false);
  });

  it("mensagens normais não disparam opt-out", () => {
    expect(detectOptOut("Podemos falar amanhã?")).toBe(false);
    expect(detectOptOut("Quanto custa para 80 convidados?")).toBe(false);
    expect(detectOptOut("Bom dia, segue o orçamento pedido")).toBe(false);
  });
});

describe("normalizeReplyText", () => {
  it("normaliza acentos, case e espaçamento", () => {
    expect(normalizeReplyText("  NÃO   Tenho  Interesse!! ")).toBe("nao tenho interesse");
  });
});

/* ============================================================
 * Regra 1 — pacing 45–90s
 * ============================================================ */

describe("limites do pacing", () => {
  it("constantes oficiais: 45–90s", () => {
    expect(MIN_INTERVAL_SECONDS).toBe(45);
    expect(MAX_INTERVAL_SECONDS).toBe(90);
  });
});

describe("resolveIntervalSeconds", () => {
  it("clamp: nunca abaixo de 45 nem acima de 90", () => {
    expect(resolveIntervalSeconds(10)).toBe(45);
    expect(resolveIntervalSeconds(999)).toBe(90);
    expect(resolveIntervalSeconds(60)).toBe(60);
    expect(resolveIntervalSeconds(Number.NaN)).toBe(60);
  });
});

describe("pickIntervalSeconds", () => {
  it("sorteia dentro de [45, 90]", () => {
    expect(pickIntervalSeconds(() => 0)).toBe(45);
    expect(pickIntervalSeconds(() => 0.999)).toBe(90);
    for (let i = 0; i < 50; i += 1) {
      const value = pickIntervalSeconds();
      expect(value).toBeGreaterThanOrEqual(45);
      expect(value).toBeLessThanOrEqual(90);
    }
  });
});

/* ============================================================
 * Payload do job
 * ============================================================ */

describe("prospectingJobSchema", () => {
  const validJob = {
    prospectId: "11111111-1111-1111-1111-111111111111",
    eventId: "22222222-2222-2222-2222-222222222222",
    instance: "eventeia-ab12cd34",
    phoneE164: "+5512999998888",
    vendorName: "Buffet da Vila",
    eventTitle: "Festa de 5 anos da Lia",
    eventType: "festa_infantil",
    eventDateIso: "2026-12-05",
    city: "São José dos Campos",
    guestCount: 60,
  };

  it("aceita payload completo", () => {
    expect(prospectingJobSchema.parse(validJob)).toEqual(validJob);
  });

  it("rejeita telefone fora do E.164 e campos ausentes", () => {
    expect(prospectingJobSchema.safeParse({ ...validJob, phoneE164: "129999-8888" }).success).toBe(
      false,
    );
    expect(prospectingJobSchema.safeParse({ ...validJob, instance: "" }).success).toBe(false);
    expect(prospectingJobSchema.safeParse({ ...validJob, prospectId: "abc" }).success).toBe(false);
  });
});
