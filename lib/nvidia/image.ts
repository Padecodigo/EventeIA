import "server-only";

import { extractNvidiaImage, sniffMime } from "./pure";

export { extractNvidiaImage, sniffMime, type ExtractedImage } from "./pure";

/**
 * Geração de imagem na NVIDIA Build (NIM GenAI).
 * Endpoint: POST https://ai.api.nvidia.com/v1/genai/{model}.
 * Retorna os bytes da imagem (Base64 em `artifacts[]`) — o chamador decide onde salvar.
 *
 * Fallback automático: quando o modelo principal está em rate limit (429/5xx),
 * tenta o(s) modelo(s) de reserva. Cada modelo tem o próprio payload (o
 * `flux.2-klein-4b` rejeita `mode`/`cfg_scale`/`width`/`height`).
 */

const BASE_URL = "https://ai.api.nvidia.com/v1/genai";
export const DEFAULT_NVIDIA_IMAGE_MODEL = "black-forest-labs/flux.1-dev";
const FALLBACK_MODELS = ["black-forest-labs/flux.2-klein-4b"];
const TIMEOUT_MS = 180_000;

/** Status que indicam rate limit/instabilidade → vale tentar o modelo de reserva. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Dimensões aceitas pelo FLUX.1-dev no endpoint genai. */
function resolveSize(width: number, height: number): { width: number; height: number } {
  if (height > width * 1.2) return { width: 768, height: 1344 }; // vertical (story/reel)
  if (width > height * 1.2) return { width: 1344, height: 768 }; // horizontal
  return { width: 1024, height: 1024 }; // quadrado
}

export type NvidiaImageResult =
  | { ok: true; bytes: Buffer; mime: string }
  | { ok: false; error: string; status: number | null };

export interface NvidiaImageInput {
  apiKey: string;
  prompt: string;
  model?: string;
  /** FLUX.1-dev usa `base` (text-to-image). */
  mode?: "base" | "t2i" | "i2i";
  width?: number;
  height?: number;
  cfgScale?: number;
  seed?: number;
  steps?: number;
  fetchImpl?: typeof fetch;
}

/** Payload específico de cada modelo (formatos não são compatíveis entre si). */
function buildNvidiaPayload(model: string, input: NvidiaImageInput): Record<string, unknown> {
  if (model.endsWith("flux.2-klein-4b")) {
    // Destilado: rejeita `mode`/`cfg_scale`/`width`/`height`; payload mínimo.
    return {
      prompt: input.prompt,
      seed: input.seed ?? 0,
      steps: input.steps ?? 30,
    };
  }
  return {
    prompt: input.prompt,
    mode: input.mode ?? "base",
    cfg_scale: input.cfgScale ?? 3.5,
    width: resolveSize(input.width ?? 1024, input.height ?? 1024).width,
    height: resolveSize(input.width ?? 1024, input.height ?? 1024).height,
    seed: input.seed ?? 0,
    steps: input.steps ?? 50,
  };
}

/** Uma chamada a um modelo: request + parse dos bytes. */
async function requestNvidiaImage(
  fetcher: typeof fetch,
  model: string,
  apiKey: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
): Promise<NvidiaImageResult> {
  const response = await fetcher(`${BASE_URL}/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    return { ok: false, error: `HTTP ${String(response.status)}: ${detail}`, status: response.status };
  }

  const body = (await response.json().catch(() => null)) as unknown;
  const extracted = extractNvidiaImage(body);
  if (extracted === null) return { ok: false, error: "resposta sem imagem", status: response.status };

  let base64 = extracted.base64;
  if (base64 === null && extracted.url !== null) {
    const download = await fetcher(extracted.url);
    if (!download.ok) return { ok: false, error: "falha ao baixar a arte", status: download.status };
    base64 = Buffer.from(await download.arrayBuffer()).toString("base64");
  }
  if (base64 === null) return { ok: false, error: "resposta sem base64 nem URL", status: response.status };

  const cleaned = base64.replace(/\s/g, "");
  const bytes = Buffer.from(cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4), "base64");
  if (bytes.length === 0) return { ok: false, error: "imagem vazia", status: response.status };

  const mime = extracted.mime ?? sniffMime(bytes) ?? "image/png";
  return { ok: true, bytes, mime };
}

export async function generateNvidiaImage(input: NvidiaImageInput): Promise<NvidiaImageResult> {
  const fetcher = input.fetchImpl ?? fetch;
  const primary = input.model ?? DEFAULT_NVIDIA_IMAGE_MODEL;
  const models = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let lastError: NvidiaImageResult = { ok: false, error: "nenhum modelo tentado", status: null };
    for (const model of models) {
      const payload = buildNvidiaPayload(model, input);
      const result = await requestNvidiaImage(fetcher, model, input.apiKey, payload, controller.signal);
      if (result.ok) return result;
      lastError = result;
      // Só tenta o reserva em rate limit/instabilidade; erro de formato/autenticação para.
      if (!RETRYABLE_STATUSES.has(result.status ?? 0)) return result;
    }
    return lastError;
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  } finally {
    clearTimeout(timer);
  }
}
