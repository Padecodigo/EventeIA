import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { InboundEvent } from "@/lib/whatsapp/inbound";

/**
 * Webhook da WhatsApp Cloud API (Meta) — funções puras.
 * Assinatura: header `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(app secret, corpo bruto).
 */
export function verifyCloudSignature(
  rawBody: string,
  header: string | null,
  appSecret: string | undefined,
): boolean {
  if (header === null || appSecret === undefined || appSecret.length === 0) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (match === null) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(match[1], "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Desafio GET de verificação: devolve o challenge apenas se o token confere. */
export function verifyCloudChallenge(
  params: URLSearchParams,
  verifyToken: string | undefined,
): string | null {
  if (verifyToken === undefined || verifyToken.length === 0) return null;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || token === null || challenge === null) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return challenge;
}

const messageSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    button: z.object({ text: z.string().optional() }).optional(),
    interactive: z
      .object({
        button_reply: z.object({ title: z.string().optional() }).optional(),
        list_reply: z.object({ title: z.string().optional() }).optional(),
      })
      .optional(),
  })
  .passthrough();

const statusSchema = z
  .object({ id: z.string(), status: z.string(), recipient_id: z.string().optional() })
  .passthrough();

export const cloudWebhookSchema = z
  .object({
    object: z.string(),
    entry: z.array(
      z
        .object({
          changes: z.array(
            z
              .object({
                field: z.string().optional(),
                value: z
                  .object({
                    messages: z.array(messageSchema).optional(),
                    statuses: z.array(statusSchema).optional(),
                  })
                  .passthrough(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const CLOUD_STATUS: Record<string, "sent" | "delivered" | "read" | "failed"> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

function toE164(waId: string): string | null {
  const digits = waId.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
}

/** Converte o payload da Meta nos eventos canônicos do pipeline de entrada. */
export function parseCloudWebhook(json: unknown): InboundEvent[] | null {
  const parsed = cloudWebhookSchema.safeParse(json);
  if (!parsed.success || parsed.data.object !== "whatsapp_business_account") return null;
  const events: InboundEvent[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      for (const m of change.value.messages ?? []) {
        const phone = toE164(m.from);
        const text =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          null;
        if (phone !== null && text !== null) {
          events.push({ kind: "message", messageId: m.id, phone, text });
        }
      }
      for (const s of change.value.statuses ?? []) {
        const status = CLOUD_STATUS[s.status];
        if (status !== undefined) events.push({ kind: "status", messageId: s.id, status });
      }
    }
  }
  return events;
}

/** Id externo estável para idempotência (webhook_events). */
export function cloudEventId(event: InboundEvent): string {
  return event.kind === "message"
    ? `message:${event.messageId}`
    : `status:${event.messageId}:${event.status}`;
}
