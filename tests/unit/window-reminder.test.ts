import { describe, expect, it } from "vitest";

import { isOptOut } from "@/lib/prospecting/opt-out";
import {
  decideReminder,
  isOptOutLike,
  reminderText,
  type ReminderCandidate,
} from "@/lib/outreach/window-reminder";

// Inbound terça 03/11/2026 19:00 BRT (22:00Z); nossa resposta 19:05 BRT.
const base: ReminderCandidate = {
  conversationId: "c1",
  channel: "instagram",
  externalUserId: "igsid",
  status: "awaiting_supplier",
  supplierOptedOut: false,
  lastInbound: { id: "m-in-1", at: "2026-11-03T22:00:00Z", body: "Oi, faço sim" },
  lastOutboundAt: "2026-11-03T22:05:00Z",
  hasPrice: false,
  reminderSentForWindow: null,
  introducedBefore: true,
};
const nearClose = new Date("2026-11-04T19:00:00Z"); // qua 16:00 BRT, 21h depois

describe("decideReminder", () => {
  it("envia perto do fechamento da janela", () => {
    expect(decideReminder(base, nearClose)).toEqual({ send: true, windowKey: "m-in-1" });
  });
  it("não envia se o fornecedor já respondeu", () => {
    const c = { ...base, lastInbound: { ...base.lastInbound!, at: "2026-11-03T22:10:00Z" } };
    expect(decideReminder(c, nearClose)).toEqual({ send: false, reason: "supplier_replied" });
  });
  it("não envia a contato em opt-out (status, fornecedor ou mensagem de parada)", () => {
    expect(decideReminder({ ...base, status: "opted_out" }, nearClose)).toMatchObject({ reason: "opted_out" });
    expect(decideReminder({ ...base, supplierOptedOut: true }, nearClose)).toMatchObject({ reason: "opted_out" });
    const stop = { ...base, lastInbound: { ...base.lastInbound!, body: "Pare!" } };
    expect(decideReminder(stop, nearClose)).toMatchObject({ reason: "opted_out" });
  });
  it("não envia mais de uma vez por janela", () => {
    expect(decideReminder({ ...base, reminderSentForWindow: "m-in-1" }, nearClose)).toMatchObject({ reason: "already_sent" });
  });
  it("nova mensagem do fornecedor = nova janela", () => {
    expect(decideReminder({ ...base, reminderSentForWindow: "m-in-0" }, nearClose).send).toBe(true);
  });
  it("não envia fora do horário comercial", () => {
    expect(decideReminder(base, new Date("2026-11-04T21:15:00Z"))).toMatchObject({ reason: "outside_business_hours" });
  });
  it("não envia após a janela (≥ 23h30)", () => {
    expect(decideReminder(base, new Date("2026-11-04T21:45:00Z"))).toMatchObject({ reason: "window_closed" });
    expect(decideReminder(base, new Date("2026-11-05T13:00:00Z"))).toMatchObject({ reason: "window_closed" });
  });
  it("não envia cedo demais", () => {
    expect(decideReminder(base, new Date("2026-11-04T13:00:00Z"))).toMatchObject({ reason: "too_early" });
  });
  it("janela fechando de madrugada → último slot comercial dentro da janela", () => {
    // inbound terça 05:00 BRT; faixa ideal qua 01:00–04:30 BRT (sem horário comercial)
    const c = { ...base, lastInbound: { ...base.lastInbound!, at: "2026-11-03T08:00:00Z" }, lastOutboundAt: "2026-11-03T12:00:00Z" };
    expect(decideReminder(c, new Date("2026-11-03T20:30:00Z"))).toMatchObject({ reason: "too_early" }); // 17:30
    expect(decideReminder(c, new Date("2026-11-03T20:45:00Z")).send).toBe(true); // 17:45
  });
  it("respeita cotação recebida e conversa fechada", () => {
    expect(decideReminder({ ...base, hasPrice: true }, nearClose)).toMatchObject({ reason: "quote_received" });
    expect(decideReminder({ ...base, status: "closed" }, nearClose)).toMatchObject({ reason: "closed" });
    expect(decideReminder({ ...base, status: "quoted" }, nearClose)).toMatchObject({ reason: "closed" });
  });
  it("WhatsApp fica de fora", () => {
    expect(decideReminder({ ...base, channel: "whatsapp" }, nearClose)).toMatchObject({ reason: "unsupported_channel" });
  });
});

describe("texto e opt-out", () => {
  it("apresenta a EventeIA só no primeiro contato e nunca usa 'assistente virtual'/'IA'", () => {
    for (const intro of [true, false]) {
      const t = reminderText(intro);
      expect(t.toLowerCase()).not.toContain("assistente virtual");
      expect(t).not.toMatch(/\bIA\b/);
      expect(t.toLowerCase()).toContain("valor");
    }
    expect(reminderText(false)).toContain("Somos a EventeIA, um serviço autônomo de prospecção de fornecedores");
    expect(reminderText(true)).not.toContain("Somos a EventeIA");
  });
  it("detecta pare/parar/não quero/sair/stop", () => {
    for (const w of ["pare", "Parar", "não quero", "sair.", "STOP"]) {
      expect(isOptOutLike(w)).toBe(true);
      expect(isOptOut(w)).toBe(true);
    }
    expect(isOptOutLike("não quero agora, mas manda o cardápio")).toBe(false);
  });
});
