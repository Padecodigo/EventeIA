import "server-only";

import { z } from "zod";

import { isConfigured, serverEnv } from "@/lib/env";
import {
  evolutionConnectionStateSchema,
  evolutionSendResponseSchema,
  firstContactPayloadSchema,
} from "@/lib/schemas/whatsapp";
import { parseConnectResponse, type ConnectPayload } from "@/lib/whatsapp/pairing";

/** Timeout por requisição: evita sockets pendurados com ~100 sessões. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Cliente tipado da Evolution API (self-hosted) — Agente Orçamentista.
 * Fonte da verdade: .context/WHATSAPP_EVOLUTION.md.
 */

export class EvolutionNotConfiguredError extends Error {
  constructor() {
    super("Evolution API não configurada (EVOLUTION_API_URL/API_KEY/INSTANCE).");
    this.name = "EvolutionNotConfiguredError";
  }
}

/** Sessão inválida/desconectada (Regra 4): fila deve pausar, sem martelar a API. */
export class EvolutionSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvolutionSessionError";
  }
}

/** Erro de negócio (número inválido, recusa, etc.) — não derruba a fila. */
class EvolutionSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvolutionSendError";
  }
}

const SESSION_ERROR_HINTS = [
  "session",
  "not connected",
  "desconectada",
  "desconectado",
  "qr code",
  "pairing",
  "unauthorized",
  // Instância apagada/nunca pareada (ex.: HTTP 404 "instance does not exist"):
  // pausa graciosa em vez de queimar as 5 tentativas do job.
  "does not exist",
  "instance not found",
];

/** Exportada para testes. */
export function looksLikeSessionProblem(status: number, bodyText: string): boolean {
  if (status === 401 || status === 403) {
    return true;
  }
  const lower = bodyText.toLowerCase();
  return SESSION_ERROR_HINTS.some((hint) => lower.includes(hint));
}

function requireEnv(): { baseUrl: string; apiKey: string } {
  const env = serverEnv();

  if (
    env.EVOLUTION_API_URL === undefined ||
    !isConfigured(env.EVOLUTION_API_KEY) ||
    env.EVOLUTION_INSTANCE === undefined
  ) {
    throw new EvolutionNotConfiguredError();
  }

  return { baseUrl: env.EVOLUTION_API_URL.replace(/\/+$/, ""), apiKey: env.EVOLUTION_API_KEY };
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    if (looksLikeSessionProblem(response.status, text)) {
      throw new EvolutionSessionError(
        `Evolution sessão inválida/desconectada (HTTP ${String(response.status)}): ${text.slice(0, 180)}`,
      );
    }
    throw new EvolutionSendError(
      `Evolution HTTP ${String(response.status)}: ${text.slice(0, 180)}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new EvolutionSendError("Resposta da Evolution não é JSON válido.");
  }
}

/** Envia texto puro por uma instância específica. */
export async function sendText(
  instance: string,
  numberE164: string,
  text: string,
): Promise<{ externalMessageId?: string }> {
  const { baseUrl, apiKey } = requireEnv();

  const response = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: numberE164, text }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body: unknown = await parseResponse(response);
  const parsed = evolutionSendResponseSchema.safeParse(body);

  if (!parsed.success) {
    return {};
  }

  return { externalMessageId: parsed.data.key?.id };
}

/** Estado da conexão da instância (open = conectada). */
export async function getConnectionState(instance: string): Promise<"open" | "connecting" | "close"> {
  const { baseUrl, apiKey } = requireEnv();

  const response = await fetch(`${baseUrl}/instance/connectionState/${instance}`, {
    method: "GET",
    headers: { apikey: apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body: unknown = await parseResponse(response);
  const parsed = evolutionConnectionStateSchema.safeParse(body);

  if (!parsed.success) {
    throw new EvolutionSendError("Formato inesperado do connectionState da Evolution.");
  }

  return parsed.data.state === "closed" ? "close" : parsed.data.state;
}

/**
 * Primeiro contato: valida o payload completo (texto puro, sem anexos/URLs)
 * ANTES de chamar a Evolution. Campos extras são rejeitados pelo Zod.
 */
export async function sendFirstContact(
  instance: string,
  payload: unknown,
): Promise<{ externalMessageId?: string }> {
  const parsed = firstContactPayloadSchema.parse(payload);
  return sendText(instance, parsed.number, parsed.text);
}

const whatsappNumbersSchema = z.array(
  z.object({ exists: z.boolean(), number: z.string().optional(), jid: z.string().optional() }),
);

/** POST /chat/whatsappNumbers/{instance}: o número tem WhatsApp? (requer sessão aberta) */
export async function checkWhatsappNumber(instance: string, numberE164: string): Promise<boolean> {
  const { baseUrl, apiKey } = requireEnv();
  const response = await fetch(`${baseUrl}/chat/whatsappNumbers/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ numbers: [numberE164.replace(/^\+/, "")] }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const parsed = whatsappNumbersSchema.safeParse(await parseResponse(response));
  return parsed.success && parsed.data.some((n) => n.exists);
}

/**
 * Número pessoal: arquiva a conversa do fornecedor para não poluir o WhatsApp do usuário.
 * (A Evolution v2 não expõe "silenciar"; arquivar é o suportado.) Best-effort.
 */
export async function archiveChat(instance: string, numberE164: string): Promise<void> {
  const { baseUrl, apiKey } = requireEnv();
  const jid = `${numberE164.replace(/^\+/, "")}@s.whatsapp.net`;
  const response = await fetch(`${baseUrl}/chat/archiveChat/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ chat: jid, archive: true, lastMessage: { key: { remoteJid: jid } } }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await parseResponse(response);
}

/** Logout gracioso da sessão (fim da janela de coleta). 404 = já encerrada. */
export async function logoutInstance(instance: string): Promise<void> {
  const { baseUrl, apiKey } = requireEnv();
  const response = await fetch(`${baseUrl}/instance/logout/${encodeURIComponent(instance)}`, {
    method: "DELETE",
    headers: { apikey: apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) {
    return;
  }
  await parseResponse(response);
}

/**
 * GET /instance/connect/{instance}?number=… — QR code + pairing code (Evolution v2).
 * Se a instância ainda não existe na Evolution, cria (Baileys) e tenta de novo.
 * A apikey nunca sai do servidor.
 */
export async function connectInstance(instance: string, numberDigits: string): Promise<ConnectPayload> {
  const { baseUrl, apiKey } = requireEnv();
  const url = `${baseUrl}/instance/connect/${encodeURIComponent(instance)}?number=${encodeURIComponent(numberDigits)}`;
  const doConnect = () =>
    fetch(url, {
      method: "GET",
      headers: { apikey: apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  let response = await doConnect();
  if (response.status === 404) {
    const created = await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ instanceName: instance, integration: "WHATSAPP-BAILEYS", qrcode: true }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await parseResponse(created);
    response = await doConnect();
  }
  const text = await response.text();
  if (!response.ok) {
    throw new EvolutionSendError(`Evolution HTTP ${String(response.status)}: ${text.slice(0, 180)}`);
  }
  try {
    return parseConnectResponse(JSON.parse(text) as unknown);
  } catch {
    throw new EvolutionSendError("Resposta da Evolution não é JSON válido.");
  }
}
