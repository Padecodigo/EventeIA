import { z } from "zod";

/**
 * Payload de webhook do Meta normalizado para um texto de mensagem recebida.
 *
 * O Meta entrega Instagram e Messenger com estruturas ligeiramente diferentes,
 * mas ambas carregam `sender.id`, `recipient.id` e `message.text`. Aqui
 * reduzimos os dois para um único formato, pronto para o pipeline de entrada.
 *
 * Cada change/messaging é validado individualmente e itens inválidos (echo,
 * delivery, read, comentários em payload de DM etc.) são ignorados — uma entrada
 * com campos mistos não derruba o parse inteiro. Os schemas usam `strip` (padrão
 * do zod), então apenas os campos validados chegam ao evento normalizado
 * persistido em `webhook_events.payload`.
 */

export type MetaInboundSource = "instagram" | "messenger";

export interface MetaInboundMessage {
  source: MetaInboundSource;
  eventId: string;
  senderId: string;
  recipientId: string;
  text: string;
}

const TEXT_MAX_CHARS = 4000;

function truncate(text: string): string {
  return text.length > TEXT_MAX_CHARS ? text.slice(0, TEXT_MAX_CHARS) : text;
}

const textMessage = z.object({
  mid: z.string().min(1),
  text: z.string(),
});

const igValue = z.object({
  sender: z.object({ id: z.string().min(1) }),
  recipient: z.object({ id: z.string().min(1) }),
  message: textMessage,
});

const messengerValue = z.object({
  sender: z.object({ id: z.string().min(1) }),
  recipient: z.object({ id: z.string().min(1) }),
  message: textMessage,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function parseInstagramMessages(root: Record<string, unknown>): MetaInboundMessage[] {
  if (!isArray(root.entry)) return [];
  const out: MetaInboundMessage[] = [];
  for (const entry of root.entry) {
    if (!isRecord(entry) || !isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || change.field !== "messages") continue;
      const parsed = igValue.safeParse(change.value);
      if (!parsed.success) continue;
      const { sender, recipient, message } = parsed.data;
      const text = truncate(message.text);
      if (text.length === 0) continue;
      out.push({
        source: "instagram",
        eventId: message.mid,
        senderId: sender.id,
        recipientId: recipient.id,
        text,
      });
    }
  }
  return out;
}

function parseMessengerMessages(root: Record<string, unknown>): MetaInboundMessage[] {
  if (!isArray(root.entry)) return [];
  const out: MetaInboundMessage[] = [];
  for (const entry of root.entry) {
    if (!isRecord(entry) || !isArray(entry.messaging)) continue;
    for (const item of entry.messaging) {
      const parsed = messengerValue.safeParse(item);
      if (!parsed.success) continue;
      const { sender, recipient, message } = parsed.data;
      const text = truncate(message.text);
      if (text.length === 0) continue;
      out.push({
        source: "messenger",
        eventId: message.mid,
        senderId: sender.id,
        recipientId: recipient.id,
        text,
      });
    }
  }
  return out;
}

/**
 * Normaliza um payload do Meta em mensagens de texto recebidas.
 * Retorna null quando o payload não é um evento de mensagem reconhecido
 * (objeto desconhecido); entradas sem mensagens válidas devolvem [].
 */
export function parseMetaWebhook(raw: unknown): MetaInboundMessage[] | null {
  if (!isRecord(raw)) return null;
  if (raw.object === "instagram") return parseInstagramMessages(raw);
  if (raw.object === "page") return parseMessengerMessages(raw);
  return null;
}

/**
 * Comentários do Instagram (post de isca) — evento separado das DMs.
 * Payload: `changes[].field === "comments"` com `{ id, text, from, media }`.
 */
export interface MetaCommentEvent {
  commentId: string;
  text: string;
  senderId: string;
  senderUsername: string;
  mediaId: string | null;
}

const commentValue = z.object({
  id: z.string().min(1),
  text: z.string(),
  from: z.object({ id: z.string().min(1), username: z.string().optional() }),
  media: z.object({ id: z.string() }).optional(),
});

function parseInstagramComments(root: Record<string, unknown>): MetaCommentEvent[] {
  if (!isArray(root.entry)) return [];
  const out: MetaCommentEvent[] = [];
  for (const entry of root.entry) {
    if (!isRecord(entry) || !isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || change.field !== "comments") continue;
      const parsed = commentValue.safeParse(change.value);
      if (!parsed.success) continue;
      const text = truncate(parsed.data.text);
      if (text.length === 0) continue;
      out.push({
        commentId: parsed.data.id,
        text,
        senderId: parsed.data.from.id,
        senderUsername: parsed.data.from.username ?? "",
        mediaId: parsed.data.media?.id ?? null,
      });
    }
  }
  return out;
}

export function parseMetaComments(raw: unknown): MetaCommentEvent[] | null {
  if (!isRecord(raw)) return null;
  if (raw.object !== "instagram") return null;
  return parseInstagramComments(raw);
}
