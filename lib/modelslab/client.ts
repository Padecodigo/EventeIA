import { MODELSLAB } from "@/lib/meta/limits";

/**
 * Cliente ModelsLab — FLUX, endpoint oficial `POST /api/v6/images/text2img`
 * com `model_id: "flux"` (confirmado em 2026-10-28).
 *
 * A chave vai no CORPO JSON (campo `key`), não em header. Os limites de
 * largura/altura/amostras vêm de `lib/meta/limits.ts`.
 */

export type ModelsLabResult =
  | { ok: true; images: string[]; id: number | null }
  | { ok: false; error: string; status: number | null };

export interface GenerateImageInput {
  apiKey: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  samples?: number;
  fetchImpl?: typeof fetch;
}

const TIMEOUT_MS = 60_000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export async function generateImage(input: GenerateImageInput): Promise<ModelsLabResult> {
  const fetcher = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetcher(MODELSLAB.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        key: input.apiKey,
        model_id: MODELSLAB.modelId,
        prompt: input.prompt,
        ...(input.negativePrompt !== undefined ? { negative_prompt: input.negativePrompt } : {}),
        width: clamp(input.width ?? MODELSLAB.maxWidthPx, 64, MODELSLAB.maxWidthPx),
        height: clamp(input.height ?? MODELSLAB.maxHeightPx, 64, MODELSLAB.maxHeightPx),
        samples: clamp(input.samples ?? 1, 1, MODELSLAB.maxSamples),
        num_inference_steps: 31,
        guidance_scale: 7.5,
        safety_checker: "yes",
        base64: false,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      status?: string;
      id?: number;
      output?: string[];
      message?: string;
    } | null;

    if (!response.ok) {
      return { ok: false, error: payload?.message ?? `HTTP ${String(response.status)}`, status: response.status };
    }

    if (payload?.status !== "success" || !Array.isArray(payload.output) || payload.output.length === 0) {
      return { ok: false, error: payload?.message ?? "resposta sem imagens", status: response.status };
    }

    return { ok: true, images: payload.output, id: payload.id ?? null };
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  } finally {
    clearTimeout(timeout);
  }
}
