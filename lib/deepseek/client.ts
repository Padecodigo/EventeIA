import "server-only";

import { z } from "zod";

/**
 * Cliente mínimo (fetch) da API DeepSeek, compatível com OpenAI Chat Completions.
 * Sem SDK extra (AGENTS.md §3.4). Mock automático quando não há chave ou em
 * teste/dev com DEEPSEEK_MOCK=1 — custo zero.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
}

/** Contrato mínimo usado pelo extrator (permite injeção em testes). */
export interface DeepSeekClient {
  readonly mode: "live" | "mock";
  complete(request: ChatCompletionRequest): Promise<string>;
}

const completionResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
});

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash"; // DeepSeek-V4.1-Flash-1017 (docs oficiais)
const TIMEOUT_MS = 30_000;

export function createLiveDeepSeekClient(options: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): DeepSeekClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = options.model ?? DEFAULT_MODEL;
  const doFetch = options.fetchImpl ?? fetch;

  return {
    mode: "live",
    async complete(request) {
      const response = await doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: request.messages,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`DeepSeek HTTP ${String(response.status)}`);
      }

      const parsed = completionResponseSchema.parse(await response.json());
      const content = parsed.choices[0]?.message.content ?? null;
      if (content === null || content.length === 0) {
        throw new Error("DeepSeek: resposta vazia");
      }
      return content;
    },
  };
}

/**
 * Mock determinístico (custo zero): extrai o primeiro valor "R$ x" do texto
 * como total. Serve para dev/E2E local — não substitui o modelo.
 */
export function createMockDeepSeekClient(): DeepSeekClient {
  return {
    mode: "mock",
    complete(request) {
      const supplierText = request.messages.find((m) => m.role === "user")?.content ?? "";
      const match = /R\$\s*([\d.]+)(?:,(\d{2}))?/.exec(supplierText);
      const totalCents =
        match === null
          ? null
          : Number((match[1] ?? "0").replace(/\./g, "")) * 100 + Number(match[2] ?? "0");

      return Promise.resolve(
        JSON.stringify({
          total_price_cents: totalCents,
          base_price_cents: totalCents,
          mandatory_fees: [],
          item_breakdown: [],
          validity_days: null,
          payment_conditions: null,
          confidence_score: totalCents === null ? 0 : 0.5,
        }),
      );
    },
  };
}

/** Seleciona live ou mock a partir do ambiente (sem expor a chave). */
export function getDeepSeekClient(env: NodeJS.ProcessEnv = process.env): DeepSeekClient {
  const apiKey = env.DEEPSEEK_API_KEY;
  const forceMock =
    env.DEEPSEEK_MOCK === "1" || env.NODE_ENV === "test" || apiKey === undefined || apiKey === "";

  if (forceMock || apiKey === undefined) {
    return createMockDeepSeekClient();
  }

  return createLiveDeepSeekClient({
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL,
    model: env.DEEPSEEK_MODEL,
  });
}
