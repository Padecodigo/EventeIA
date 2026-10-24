import { describe, expect, it } from "vitest";

import {
  TYPE_LABELS,
  adminAlertEmail,
  confirmationEmail,
  TICKET_TYPES,
  canTransition,
  countTickets,
  createTicketSchema,
  defaultPriority,
  eventIdFromPath,
  needsAdminAlert,
  sanitizePageUrl,
  ticketFiltersSchema,
  userCanReply,
  validateAttachment,
} from "@/lib/support/pure";

const EVT = "e1111111-1111-4111-8111-111111111111";

describe("central de atendimento — regras puras", () => {
  it("prioridade padrão: problema ⇒ alta; demais ⇒ normal", () => {
    expect(defaultPriority("problema")).toBe("alta");
    expect(defaultPriority("sugestao")).toBe("normal");
    expect(defaultPriority("reclamacao")).toBe("normal");
    expect(defaultPriority("elogio")).toBe("normal");
  });

  it("transições de status", () => {
    expect(canTransition("aberto", "em_andamento")).toBe(true);
    expect(canTransition("resolvido", "aberto")).toBe(true);
    expect(canTransition("fechado", "aberto")).toBe(true);
    expect(canTransition("fechado", "resolvido")).toBe(false);
    expect(canTransition("fechado", "em_andamento")).toBe(false);
    expect(canTransition("aberto", "aberto")).toBe(true);
    expect(userCanReply("fechado")).toBe(false);
    expect(userCanReply("resolvido")).toBe(true);
  });

  it("alerta imediato ao admin para problema ou urgente", () => {
    expect(needsAdminAlert({ type: "problema", priority: "alta" })).toBe(true);
    expect(needsAdminAlert({ type: "sugestao", priority: "urgente" })).toBe(true);
    expect(needsAdminAlert({ type: "elogio", priority: "normal" })).toBe(false);
  });

  it("valida entrada (zod)", () => {
    const ok = createTicketSchema.safeParse({ type: "sugestao", subject: "  Ideia  ", message: "Uma ideia bem legal", email: "A@B.com" });
    expect(ok.success && ok.data.subject).toBe("Ideia");
    expect(ok.success && ok.data.email).toBe("a@b.com");
    expect(createTicketSchema.safeParse({ type: "outro", subject: "abc", message: "1234567890" }).success).toBe(false);
    expect(createTicketSchema.safeParse({ type: "elogio", subject: "ab", message: "1234567890" }).success).toBe(false);
    expect(createTicketSchema.safeParse({ type: "elogio", subject: "abc", message: "curta" }).success).toBe(false);
    expect(createTicketSchema.safeParse({ type: "elogio", subject: "abc", message: "x".repeat(5001) }).success).toBe(false);
    expect(createTicketSchema.safeParse({ type: "elogio", subject: "abc", message: "1234567890", email: "nao-email" }).success).toBe(false);
    expect(createTicketSchema.safeParse({ type: "elogio", subject: "abc", message: "1234567890", website: "spam" }).success).toBe(false);
  });

  it("contexto automático: evento e URL saneada", () => {
    expect(eventIdFromPath(`/eventos/${EVT}/cotacoes`)).toBe(EVT);
    expect(eventIdFromPath("/eventos/novo")).toBeNull();
    expect(eventIdFromPath("/painel")).toBeNull();
    expect(sanitizePageUrl("https://user:senha@evil.com/eventos?x=1#frag")).toBe("/eventos?x=1");
    expect(sanitizePageUrl("/painel")).toBe("/painel");
    expect(sanitizePageUrl("")).toBeNull();
  });

  it("valida anexo", () => {
    expect(validateAttachment(null)).toEqual({ ok: true, ext: null });
    expect(validateAttachment({ size: 10, type: "image/png" })).toEqual({ ok: true, ext: "png" });
    expect(validateAttachment({ size: 10, type: "application/pdf" }).ok).toBe(false);
    expect(validateAttachment({ size: 6 * 1024 * 1024, type: "image/jpeg" }).ok).toBe(false);
  });

  it("filtros inválidos são ignorados e contadores somam", () => {
    expect(ticketFiltersSchema.parse({ type: "x", status: "aberto", from: "ontem" })).toEqual({ status: "aberto" });
    const c = countTickets([
      { type: "problema", status: "aberto" },
      { type: "problema", status: "fechado" },
      { type: "elogio", status: "aberto" },
    ]);
    expect(c.byType.problema).toBe(2);
    expect(c.byType.sugestao).toBe(0);
    expect(c.byStatus.aberto).toBe(2);
  });

  it("alerta ao admin não inclui PII do usuário", () => {
    const mail = adminAlertEmail({ id: "abcdef12-0000", type: "problema", subject: "Erro", priority: "alta" }, "https://app");
    expect(mail.subject).toContain("#ABCDEF12");
    expect(mail.text).toContain("https://app/admin/chamados/abcdef12-0000");
    expect(mail.text).not.toContain("@");
  });
});

describe("TYPE_LABELS", () => {
  it("mostra 'Erro no site' para o tipo problema (valor do enum mantido)", () => {
    expect(TYPE_LABELS.problema).toBe("Erro no site");
    expect(Object.values(TYPE_LABELS)).not.toContain("Problema (chamado)");
  });
});

describe("e-mails por tipo (regressão de concordância)", () => {
  it.each(TICKET_TYPES)("confirmação e alerta neutros para %s", (type) => {
    const t = { id: "abcdef12-0000", type, subject: "Assunto", priority: "normal" as const };
    const label = TYPE_LABELS[type];
    const conf = confirmationEmail(t, "https://app", true).text;
    expect(conf).toContain(`Recebemos seu chamado (${label}): "Assunto".`);
    expect(conf).not.toMatch(/Recebemos sua /);
    expect(conf).not.toContain(label.toLowerCase());
    expect(adminAlertEmail(t, "https://app").text).toContain(`Novo chamado (${label}) com prioridade normal`);
  });
});
