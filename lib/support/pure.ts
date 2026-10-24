import { z } from "zod";

/** Central de atendimento — regras puras (validação, prioridades, transições, e-mails). */

export const TICKET_TYPES = ["sugestao", "reclamacao", "elogio", "problema"] as const;
export const TICKET_STATUSES = ["aberto", "em_andamento", "resolvido", "fechado"] as const;
export const TICKET_PRIORITIES = ["baixa", "normal", "alta", "urgente"] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TYPE_LABELS: Record<TicketType, string> = {
  sugestao: "Sugestão",
  reclamacao: "Reclamação",
  elogio: "Elogio / feedback",
  problema: "Erro no site",
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

/** Espelha o trigger da 0027: 'problema' nasce com prioridade alta. */
export function defaultPriority(type: TicketType): TicketPriority {
  return type === "problema" ? "alta" : "normal";
}

const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  aberto: ["em_andamento", "resolvido", "fechado"],
  em_andamento: ["aberto", "resolvido", "fechado"],
  resolvido: ["aberto", "em_andamento", "fechado"],
  fechado: ["aberto"],
};

/** Transições permitidas ao admin (mesmo status = no-op permitido). */
export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/** Usuário pode responder enquanto o ticket não estiver fechado. */
export function userCanReply(status: TicketStatus): boolean {
  return status !== "fechado";
}

/** Notificação imediata ao admin. */
export function needsAdminAlert(ticket: { type: TicketType; priority: TicketPriority }): boolean {
  return ticket.type === "problema" || ticket.priority === "urgente";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extrai o id do evento de /eventos/<uuid>/... (contexto automático). */
export function eventIdFromPath(path: string | null | undefined): string | null {
  if (typeof path !== "string") return null;
  const match = /^\/eventos\/([^/?#]+)/.exec(path);
  const id = match?.[1];
  return id !== undefined && UUID_RE.test(id) ? id.toLowerCase() : null;
}

/** Guarda só caminho + query relativos (sem host/credenciais), até 500 chars. */
export function sanitizePageUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  try {
    const url = new URL(raw, "https://eventeia.local");
    return `${url.pathname}${url.search}`.slice(0, 500);
  } catch {
    return null;
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined || v.length === 0 ? null : v));

export const createTicketSchema = z.object({
  type: z.enum(TICKET_TYPES),
  subject: z.string().trim().min(3, "Assunto muito curto").max(140),
  message: z.string().trim().min(10, "Conte um pouco mais (mín. 10 caracteres)").max(5000),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido")
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  pageUrl: optionalText(500),
  eventId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  // honeypot: bots preenchem; humanos não veem o campo.
  website: z.string().max(0).optional().or(z.literal("")),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const replySchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1, "Escreva uma mensagem").max(5000),
});

export const adminUpdateSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(TICKET_STATUSES),
  priority: z.enum(TICKET_PRIORITIES),
});

export const ticketFiltersSchema = z.object({
  type: z.enum(TICKET_TYPES).optional().catch(undefined),
  status: z.enum(TICKET_STATUSES).optional().catch(undefined),
  priority: z.enum(TICKET_PRIORITIES).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});

export type TicketFilters = z.infer<typeof ticketFiltersSchema>;

const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Valida a captura de tela; retorna a extensão ou um erro legível. */
export function validateAttachment(
  file: { size: number; type: string } | null,
): { ok: true; ext: string | null } | { ok: false; error: string } {
  if (file === null || file.size === 0) return { ok: true, ext: null };
  if (file.size > ATTACHMENT_MAX_BYTES) return { ok: false, error: "Imagem acima de 5 MB" };
  const ext = ATTACHMENT_EXT[file.type];
  if (ext === undefined) return { ok: false, error: "Envie PNG, JPG ou WEBP" };
  return { ok: true, ext };
}

/** Contadores por tipo e status (admin). */
export function countTickets(rows: { type: TicketType; status: TicketStatus }[]): {
  byType: Record<TicketType, number>;
  byStatus: Record<TicketStatus, number>;
} {
  const byType = Object.fromEntries(TICKET_TYPES.map((t) => [t, 0])) as Record<TicketType, number>;
  const byStatus = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
  for (const row of rows) {
    byType[row.type] += 1;
    byStatus[row.status] += 1;
  }
  return { byType, byStatus };
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

interface Mail {
  subject: string;
  text: string;
}

interface MailTicket {
  id: string;
  type: TicketType;
  subject: string;
  priority: TicketPriority;
}

export function confirmationEmail(t: MailTicket, appUrl: string, loggedIn: boolean): Mail {
  const link = loggedIn ? `\n\nAcompanhe em: ${appUrl}/chamados/${t.id}` : "";
  return {
    subject: `Recebemos sua mensagem — #${shortId(t.id)}`,
    text:
      `Olá! Recebemos seu chamado (${TYPE_LABELS[t.type]}): "${t.subject}".\n` +
      `Protocolo: #${shortId(t.id)}. Nossa equipe responde por este e-mail.${link}\n\n— Equipe EventeIA`,
  };
}

export function adminReplyEmail(t: MailTicket, body: string, appUrl: string, loggedIn: boolean): Mail {
  const link = loggedIn ? `\n\nResponda em: ${appUrl}/chamados/${t.id}` : "";
  return {
    subject: `Resposta ao seu chamado #${shortId(t.id)}`,
    text: `A equipe EventeIA respondeu "${t.subject}":\n\n${body}${link}\n\n— Equipe EventeIA`,
  };
}

/** Alerta ao admin: sem conteúdo da mensagem nem e-mail do usuário (PII fica no painel). */
export function adminAlertEmail(t: MailTicket, appUrl: string): Mail {
  return {
    subject: `[${PRIORITY_LABELS[t.priority]}] ${TYPE_LABELS[t.type]} #${shortId(t.id)}`,
    text: `Novo chamado (${TYPE_LABELS[t.type]}) com prioridade ${PRIORITY_LABELS[t.priority].toLowerCase()}: "${t.subject}".\n\n${appUrl}/admin/chamados/${t.id}`,
  };
}
