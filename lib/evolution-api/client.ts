import "server-only";

import { isConfigured, serverEnv } from "@/lib/env";
import {
  evolutionConnectionStateSchema,
  evolutionSendResponseSchema,
} from "@/lib/schemas/whatsapp";

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
];

function looksLikeSessionProblem(status: number, bodyText: string): boolean {
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
  });

  const body: unknown = await parseResponse(response);
  const parsed = evolutionConnectionStateSchema.safeParse(body);

  if (!parsed.success) {
    throw new EvolutionSendError("Formato inesperado do connectionState da Evolution.");
  }

  return parsed.data.state === "closed" ? "close" : parsed.data.state;
}
