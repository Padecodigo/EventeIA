/**
 * Pareamento do WhatsApp do cliente (Evolution API v2) — módulo puro, testável.
 *
 * GET /instance/connect/{instance}?number=<dígitos E.164> devolve o QR code e,
 * quando `number` é informado, um `pairingCode` de 8 caracteres para
 * "Conectar com número de telefone" (Aparelhos conectados).
 */

import { z } from "zod";

/** Os códigos do WhatsApp expiram rápido; renovamos antes disso. */
export const PAIRING_CODE_TTL_SECONDS = 60;
/** Intervalo de polling do estado da conexão. */
export const CONNECTION_POLL_INTERVAL_MS = 4_000;

/** Link que abre o app do WhatsApp (o usuário segue para Aparelhos conectados). */
export const WHATSAPP_OPEN_URL = "whatsapp://";
/** Fallback web quando o esquema whatsapp:// não está disponível. */
export const WHATSAPP_FALLBACK_URL = "https://wa.me/";

export const PAIRING_STEPS = [
  "Abra o WhatsApp no seu celular.",
  "Toque em Configurações (no iPhone) ou nos três pontos ⋮ (no Android).",
  "Toque em Aparelhos conectados e depois em Conectar um aparelho.",
  "Toque em Conectar com número de telefone.",
  "Digite o código de 8 caracteres mostrado aqui.",
] as const;

/**
 * Valida o número do WhatsApp que será pareado e devolve só os dígitos E.164
 * (sem "+"), formato exigido pela Evolution. Sem "+": assume Brasil (+55) com
 * DDD válido. Com "+": aceita qualquer país (8–15 dígitos, padrão E.164).
 */
export function parsePairingPhone(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || /[^\d\s()+.-]/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+") && !trimmed.startsWith("+55")) {
    return digits.length >= 8 && digits.length <= 15 && !digits.startsWith("0") ? digits : null;
  }

  const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (national.length !== 10 && national.length !== 11) return null;
  const ddd = national.slice(0, 2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  const subscriber = national.slice(2);
  if (subscriber.length === 9 && !subscriber.startsWith("9")) return null;
  if (/^(\d)\1+$/.test(subscriber)) return null;
  return `55${national}`;
}

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile|webOS|BlackBerry/i;

/** Detecção por user agent (o componente ainda tem fallback responsivo). */
export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  if (userAgent === null || userAgent === undefined) return false;
  return MOBILE_UA.test(userAgent);
}

/** "ABCD1234" → "ABCD-1234" (como o WhatsApp exibe). */
export function formatPairingCode(code: string): string {
  const clean = code.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

const evolutionConnectResponseSchema = z
  .object({
    pairingCode: z.string().nullish(),
    code: z.string().nullish(),
    base64: z.string().nullish(),
    count: z.number().optional(),
    instance: z.object({ state: z.string().optional() }).partial().optional(),
  })
  .passthrough();

export interface ConnectPayload {
  pairingCode: string | null;
  qrDataUrl: string | null;
  alreadyConnected: boolean;
}

/** Normaliza a resposta do /instance/connect (QR em data URL, código formatado). */
export function parseConnectResponse(body: unknown): ConnectPayload {
  const parsed = evolutionConnectResponseSchema.safeParse(body);
  if (!parsed.success) return { pairingCode: null, qrDataUrl: null, alreadyConnected: false };
  const { pairingCode, base64, instance } = parsed.data;
  const alreadyConnected = instance?.state === "open";
  const qrDataUrl =
    typeof base64 === "string" && base64.length > 0
      ? base64.startsWith("data:image/")
        ? base64
        : `data:image/png;base64,${base64}`
      : null;
  const code =
    typeof pairingCode === "string" && pairingCode.trim().length > 0
      ? formatPairingCode(pairingCode)
      : null;
  return { pairingCode: code, qrDataUrl, alreadyConnected };
}

export type InstanceBinding = "insert" | "keep" | "rebind" | "busy";

/**
 * A instância é uma por usuário, mas o webhook `connection.update` resolve o
 * evento por `whatsapp_instances.event_id`. Ao parear para OUTRO evento, o
 * vínculo precisa migrar — senão a sessão ativa a janela do evento antigo.
 * Se a instância está em coleta (active/draining) de outro evento, não mexe.
 */
export function decideInstanceBinding(
  row: { event_id: string | null; status: string } | null,
  eventId: string,
): InstanceBinding {
  if (row === null) return "insert";
  if (row.event_id === eventId) return "keep";
  if (row.status === "active" || row.status === "draining") return "busy";
  return "rebind";
}

/** Lançado quando o WhatsApp do usuário está coletando cotações de outro evento. */
export class InstanceBusyError extends Error {
  constructor() {
    super("instância em uso por outro evento");
    this.name = "InstanceBusyError";
  }
}
