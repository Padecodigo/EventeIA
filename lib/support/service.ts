import type { EmailAdapter } from "@/lib/notifications/email";

import {
  adminAlertEmail,
  adminReplyEmail,
  canTransition,
  confirmationEmail,
  createTicketSchema,
  defaultPriority,
  eventIdFromPath,
  needsAdminAlert,
  replySchema,
  adminUpdateSchema,
  sanitizePageUrl,
  userCanReply,
  validateAttachment,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from "./pure";

/**
 * Casos de uso da central de atendimento, com dependências injetáveis
 * (runtime.ts liga ao Supabase/Resend; testes usam memória).
 */
export interface TicketRow {
  id: string;
  user_id: string | null;
  email: string | null;
  type: TicketType;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
}

export interface SupportDeps {
  /** Lança SupportRateLimitedError quando a chave excede o limite. */
  rateHit(key: string, limit: number): Promise<void>;
  eventOwnedBy(eventId: string, userId: string): Promise<boolean>;
  uploadAttachment(path: string, file: Blob, contentType: string): Promise<boolean>;
  insertTicket(row: {
    user_id: string | null;
    email: string | null;
    type: TicketType;
    subject: string;
    message: string;
    event_id: string | null;
    page_url: string | null;
    user_agent: string | null;
    attachment_path: string | null;
    priority: TicketPriority;
  }): Promise<TicketRow>;
  getTicket(id: string): Promise<TicketRow | null>;
  insertMessage(row: { ticket_id: string; author_role: "user" | "admin"; author_id: string; body: string }): Promise<void>;
  updateTicket(id: string, patch: { status: TicketStatus; priority: TicketPriority }): Promise<void>;
  contactEmail(ticket: TicketRow): Promise<string | null>;
  newId(): string;
  email: EmailAdapter;
  adminEmail: string | null;
  appUrl: string;
  warn(message: string, context: Record<string, unknown>): void;
}

export class SupportRateLimitedError extends Error {}

export type ActionResult = { ok: true; ticketId: string } | { ok: false; error: string };

const RATE_LIMIT_PER_10_MIN = 5;

async function safeSend(deps: SupportDeps, to: string | null, mail: { subject: string; text: string }) {
  if (to === null) return;
  try {
    await deps.email.send({ to, ...mail });
  } catch (caught) {
    deps.warn("e-mail de atendimento falhou", {
      reason: caught instanceof Error ? caught.message : "desconhecido",
    });
  }
}

export async function createTicket(
  deps: SupportDeps,
  ctx: { userId: string | null; userEmail: string | null; ipKey: string; userAgent: string | null },
  raw: Record<string, unknown>,
  file: File | null,
): Promise<ActionResult> {
  const parsed = createTicketSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const input = parsed.data;
  if (input.website !== undefined && input.website !== "") {
    return { ok: false, error: "Dados inválidos" };
  }
  const email = ctx.userId === null ? (input.email ?? null) : null;
  if (ctx.userId === null && email === null) {
    return { ok: false, error: "Informe um e-mail para receber a resposta" };
  }
  const attachment = validateAttachment(file);
  if (!attachment.ok) return { ok: false, error: attachment.error };

  try {
    await deps.rateHit(ctx.userId !== null ? `user:${ctx.userId}` : `ip:${ctx.ipKey}`, RATE_LIMIT_PER_10_MIN);
  } catch (caught) {
    if (caught instanceof SupportRateLimitedError) {
      return { ok: false, error: "Muitas mensagens em pouco tempo. Tente de novo em alguns minutos." };
    }
    throw caught;
  }

  const pageUrl = sanitizePageUrl(input.pageUrl);
  let eventId: string | null = null;
  const candidateEvent = input.eventId ?? eventIdFromPath(pageUrl);
  if (ctx.userId !== null && candidateEvent !== null && candidateEvent !== undefined) {
    eventId = (await deps.eventOwnedBy(candidateEvent, ctx.userId)) ? candidateEvent : null;
  }

  let attachmentPath: string | null = null;
  if (attachment.ext !== null && file !== null) {
    const path = `${ctx.userId ?? "anon"}/${deps.newId()}.${attachment.ext}`;
    attachmentPath = (await deps.uploadAttachment(path, file, file.type)) ? path : null;
  }

  const ticket = await deps.insertTicket({
    user_id: ctx.userId,
    email,
    type: input.type,
    subject: input.subject,
    message: input.message,
    event_id: eventId,
    page_url: pageUrl,
    user_agent: ctx.userAgent?.slice(0, 400) ?? null,
    attachment_path: attachmentPath,
    priority: defaultPriority(input.type),
  });

  await safeSend(deps, ctx.userId !== null ? ctx.userEmail : email, confirmationEmail(ticket, deps.appUrl, ctx.userId !== null));
  if (needsAdminAlert(ticket)) {
    await safeSend(deps, deps.adminEmail, adminAlertEmail(ticket, deps.appUrl));
  }
  return { ok: true, ticketId: ticket.id };
}

export async function replyAsUser(
  deps: SupportDeps,
  userId: string,
  raw: Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const ticket = await deps.getTicket(parsed.data.ticketId);
  // Mesmo erro para inexistente e alheio (não revela existência).
  if (ticket === null || ticket.user_id !== userId) return { ok: false, error: "Chamado não encontrado" };
  if (!userCanReply(ticket.status)) return { ok: false, error: "Chamado fechado" };
  await deps.insertMessage({ ticket_id: ticket.id, author_role: "user", author_id: userId, body: parsed.data.body });
  return { ok: true, ticketId: ticket.id };
}

export async function replyAsAdmin(
  deps: SupportDeps,
  adminId: string,
  raw: Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const ticket = await deps.getTicket(parsed.data.ticketId);
  if (ticket === null) return { ok: false, error: "Chamado não encontrado" };
  await deps.insertMessage({ ticket_id: ticket.id, author_role: "admin", author_id: adminId, body: parsed.data.body });
  if (ticket.status === "aberto") {
    await deps.updateTicket(ticket.id, { status: "em_andamento", priority: ticket.priority });
  }
  await safeSend(
    deps,
    await deps.contactEmail(ticket),
    adminReplyEmail(ticket, parsed.data.body, deps.appUrl, ticket.user_id !== null),
  );
  return { ok: true, ticketId: ticket.id };
}

export async function updateTicketAsAdmin(
  deps: SupportDeps,
  raw: Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = adminUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Dados inválidos" };
  const ticket = await deps.getTicket(parsed.data.ticketId);
  if (ticket === null) return { ok: false, error: "Chamado não encontrado" };
  if (!canTransition(ticket.status, parsed.data.status)) {
    return { ok: false, error: "Transição de status inválida" };
  }
  await deps.updateTicket(ticket.id, { status: parsed.data.status, priority: parsed.data.priority });
  if (parsed.data.priority === "urgente" && ticket.priority !== "urgente") {
    await safeSend(deps, deps.adminEmail, adminAlertEmail({ ...ticket, priority: "urgente" }, deps.appUrl));
  }
  return { ok: true, ticketId: ticket.id };
}
