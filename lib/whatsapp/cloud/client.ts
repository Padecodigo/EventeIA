import "server-only";

import { z } from "zod";

import { serverEnv } from "@/lib/env";

import { buildFirstContactTemplatePayload } from "./template";

/** Cliente da WhatsApp Cloud API (Graph API da Meta). Segredos só no servidor. */
const REQUEST_TIMEOUT_MS = 15_000;

export class CloudNotConfiguredError extends Error {
  constructor() {
    super("WhatsApp Cloud API não configurada (WHATSAPP_CLOUD_TOKEN/PHONE_NUMBER_ID).");
    this.name = "CloudNotConfiguredError";
  }
}

export class CloudSendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "CloudSendError";
  }
}

const sendResponseSchema = z.object({
  messages: z.array(z.object({ id: z.string() })).min(1),
});
const errorSchema = z.object({
  error: z.object({ message: z.string().optional(), code: z.number().optional() }),
});

function requireCloudEnv(): { token: string; phoneNumberId: string; version: string } {
  const env = serverEnv();
  const token = env.WHATSAPP_CLOUD_TOKEN ?? "";
  const phoneNumberId = env.WHATSAPP_CLOUD_PHONE_NUMBER_ID ?? "";
  if (token.length === 0 || phoneNumberId.length === 0) throw new CloudNotConfiguredError();
  return { token, phoneNumberId, version: env.WHATSAPP_CLOUD_API_VERSION };
}

async function postMessage(body: unknown): Promise<{ externalMessageId?: string }> {
  const { token, phoneNumberId, version } = requireCloudEnv();
  const response = await fetch(
    `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // corpo vazio/inválido tratado abaixo
  }
  if (!response.ok) {
    const err = errorSchema.safeParse(json);
    // Nunca inclui token/corpo na mensagem de erro.
    throw new CloudSendError(
      `Cloud API respondeu ${String(response.status)}${err.success && err.data.error.code !== undefined ? ` (código ${String(err.data.error.code)})` : ""}`,
      response.status,
      err.success ? err.data.error.code : undefined,
    );
  }
  const parsed = sendResponseSchema.safeParse(json);
  return parsed.success ? { externalMessageId: parsed.data.messages[0].id } : {};
}

/** Texto livre — permitido apenas dentro da janela de 24h. */
export async function sendCloudText(
  numberE164: string,
  text: string,
): Promise<{ externalMessageId?: string }> {
  return postMessage({
    messaging_product: "whatsapp",
    to: numberE164.replace(/^\+/, ""),
    type: "text",
    text: { preview_url: false, body: text },
  });
}

/** Primeiro contato via template aprovado; texto vira variáveis do corpo. */
export async function sendCloudFirstContactTemplate(
  numberE164: string,
  text: string,
): Promise<{ externalMessageId?: string }> {
  const env = serverEnv();
  return postMessage(
    buildFirstContactTemplatePayload({
      to: numberE164,
      text,
      templateName: env.WHATSAPP_CLOUD_FIRST_CONTACT_TEMPLATE,
      languageCode: env.WHATSAPP_CLOUD_TEMPLATE_LANGUAGE,
      paramCount: env.WHATSAPP_CLOUD_FIRST_CONTACT_PARAM_COUNT,
    }),
  );
}
