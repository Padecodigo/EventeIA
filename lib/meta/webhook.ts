import { z } from "zod";

/**
 * Payload de webhook do Meta normalizado para um texto de mensagem recebida.
 *
 * O Meta entrega Instagram e Messenger com estruturas ligeiramente diferentes,
 * mas ambas carregam `sender.id`, `recipient.id` e `message.text`. Aqui
 * reduzimos os dois para um único formato, pronto para o pipeline de entrada.
 */

export type MetaInboundSource = "instagram" | "messenger";

export interface MetaInboundMessage {
  source: MetaInboundSource;
  eventId: string;
  senderId: string;
  recipientId: string;
  text: string;
}

const textMessage = z.object({
  mid: z.string(),
  text: z.string(),
});

const igValue = z.object({
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  message: textMessage.passthrough(),
});

const messengerValue = z.object({
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  message: textMessage.passthrough(),
});

const instagramSchema = z.object({
  object: z.literal("instagram"),
  entry: z.array(
    z.object({
      changes: z
        .array(
          z.object({
            field: z.literal("messages"),
            value: igValue.passthrough(),
          }),
        )
        .optional(),
    }),
  ),
});

const messengerSchema = z.object({
  object: z.literal("page"),
  entry: z.array(
    z.object({
      messaging: z.array(messengerValue.passthrough()).optional(),
    }),
  ),
});

/**
 * Normaliza um payload do Meta em mensagens de texto recebidas.
 * Retorna null quando o payload não é um evento de mensagem reconhecido
 * (echo, delivery, read, ou payload de outro tipo).
 */
export function parseMetaWebhook(raw: unknown): MetaInboundMessage[] | null {
  const ig = instagramSchema.safeParse(raw);
  if (ig.success) {
    const out: MetaInboundMessage[] = [];
    for (const entry of ig.data.entry) {
      for (const change of entry.changes ?? []) {
        if (!change.value.message.text) continue;
        out.push({
          source: "instagram",
          eventId: change.value.message.mid,
          senderId: change.value.sender.id,
          recipientId: change.value.recipient.id,
          text: change.value.message.text,
        });
      }
    }
    return out;
  }

  const msg = messengerSchema.safeParse(raw);
  if (msg.success) {
    const out: MetaInboundMessage[] = [];
    for (const entry of msg.data.entry) {
      for (const m of entry.messaging ?? []) {
        if (!m.message.text) continue;
        out.push({
          source: "messenger",
          eventId: m.message.mid,
          senderId: m.sender.id,
          recipientId: m.recipient.id,
          text: m.message.text,
        });
      }
    }
    return out;
  }

  return null;
}
