import "server-only";

import { extractNvidiaImage, sniffMime } from "./pure";

export { extractNvidiaImage, sniffMime, type ExtractedImage } from "./pure";

/**
 * Geração de imagem na NVIDIA Build (NIM GenAI).
 * Endpoint: POST https://ai.api.nvidia.com/v1/genai/{model} com `mode: "t2i"`.
 * Retorna os bytes da imagem (Base64 em `artifacts[]`) — o chamador decide onde salvar.
 */

const BASE_URL = "https://ai.api.nvidia.com/v1/genai";
export const DEFAULT_NVIDIA_IMAGE_MODEL = "black-forest-labs/flux-3-image-klein";
const TIMEOUT_MS = 120_000;

export type NvidiaImageResult =
  | { ok: true; bytes: Buffer; mime: string }
  | { ok: false; error: string; status: number | null };

export interface NvidiaImageInput {
  apiKey: string;
  prompt: string;
  model?: string;
  mode?: "t2i" | "i2i";
  fetchImpl?: typeof fetch;
}

export async function generateNvidiaImage(input: NvidiaImageInput): Promise<NvidiaImageResult> {
  const fetcher = input.fetchImpl ?? fetch;
  const model = input.model ?? DEFAULT_NVIDIA_IMAGE_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetcher(`${BASE_URL}/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: input.prompt, mode: input.mode ?? "t2i" }),
      signal: controller.signal,
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
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  } finally {
    clearTimeout(timer);
  }
}
