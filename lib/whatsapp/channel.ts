/**
 * Seleção do canal WhatsApp (puro, testável).
 *
 * - `cloud`: WhatsApp Cloud API oficial da Meta (número da EventeIA) — primário.
 * - `evolution`: Evolution API v2 (WhatsApp do próprio cliente) — fallback.
 *
 * Ordem: canal do evento → canal do cliente (perfil) → padrão (cloud quando
 * configurado, senão evolution). Se o canal escolhido é `cloud` mas a Cloud API
 * não está configurada, cai para `evolution` (nunca quebra o envio).
 */
export const WHATSAPP_CHANNELS = ["cloud", "evolution"] as const;
export type WhatsappChannel = (typeof WHATSAPP_CHANNELS)[number];

export function isWhatsappChannel(value: unknown): value is WhatsappChannel {
  return value === "cloud" || value === "evolution";
}

export interface CloudEnvLike {
  WHATSAPP_CLOUD_TOKEN?: string;
  WHATSAPP_CLOUD_PHONE_NUMBER_ID?: string;
}

/** Cloud API utilizável para ENVIO (token + phone number id presentes). */
export function isCloudConfigured(env: CloudEnvLike): boolean {
  return (
    (env.WHATSAPP_CLOUD_TOKEN ?? "").trim().length > 0 &&
    (env.WHATSAPP_CLOUD_PHONE_NUMBER_ID ?? "").trim().length > 0
  );
}

export function resolveWhatsappChannel(input: {
  eventChannel?: string | null;
  profileChannel?: string | null;
  cloudConfigured: boolean;
}): WhatsappChannel {
  const chosen = isWhatsappChannel(input.eventChannel)
    ? input.eventChannel
    : isWhatsappChannel(input.profileChannel)
      ? input.profileChannel
      : input.cloudConfigured
        ? "cloud"
        : "evolution";
  return chosen === "cloud" && !input.cloudConfigured ? "evolution" : chosen;
}

/** Janela de atendimento da Meta: texto livre só até 24h após a última mensagem do contato. */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinServiceWindow(
  lastInboundAt: string | Date | null | undefined,
  now: Date,
): boolean {
  if (lastInboundAt === null || lastInboundAt === undefined) return false;
  const t = new Date(lastInboundAt).getTime();
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age < CUSTOMER_SERVICE_WINDOW_MS;
}
