import { z } from "zod";

import { contingencyClassification, contingencyFirstReply, contingencyHiddenFees, contingencyOptOut, contingencyQuotation } from "./contingency";
import type { LlmClient, LlmProviderName } from "./router";

/** Nome documentado em api-docs.deepseek.com (serve o DeepSeek-V4.1-Flash-1017). */
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";

/** Cliente OpenAI-compatível (/chat/completions) — NIM, xAI e DeepSeek. Sem SDK. */
const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable().optional() }) })).min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().min(0),
      completion_tokens: z.number().int().min(0),
      // DeepSeek: tokens de entrada servidos do cache de contexto.
      prompt_cache_hit_tokens: z.number().int().min(0).optional(),
    })
    .optional(),
});

export const LLM_ENDPOINTS: Record<LlmProviderName, { baseUrl: string; model: string }> = {
  nim: { baseUrl: "https://integrate.api.nvidia.com/v1", model: "nvidia/nemotron-3.5-lightning-30b-a3b" },
  grok: { baseUrl: "https://api.x.ai/v1", model: "grok-4.7" },
    // Modelo documentado atual (DeepSeek-V4.1-Flash-1017). Sobrescreva com DEEPSEEK_MODEL.
  deepseek: { baseUrl: "https://api.deepseek.com", model: DEFAULT_DEEPSEEK_MODEL },
};

export function createOpenAiCompatibleClient(options: {
  name: LlmProviderName;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): LlmClient {
  const baseUrl = (options.baseUrl ?? LLM_ENDPOINTS[options.name].baseUrl).replace(/\/+$/, "");
  const model = options.model ?? LLM_ENDPOINTS[options.name].model;
  const doFetch = options.fetchImpl ?? fetch;
  return {
    name: options.name,
    async complete({ messages, maxTokens, json }) {
      const res = await doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens,
          messages,
          // NIM nem sempre aceita response_format; a validação zod cobre.
          ...(json && options.name !== "nim" ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${options.name} HTTP ${String(res.status)}`);
      const parsed = completionSchema.parse(await res.json());
      const content = parsed.choices[0]?.message.content ?? "";
      if (content.length === 0) throw new Error(`${options.name}: resposta vazia`);
      return {
        content,
        inputTokens: parsed.usage?.prompt_tokens,
        outputTokens: parsed.usage?.completion_tokens,
        cacheHitTokens: parsed.usage?.prompt_cache_hit_tokens,
      };
    },
  };
}

/**
 * Cliente simulado (custo zero, sem rede) para dev/E2E: responde JSON válido por tarefa
 * a partir dos parsers determinísticos, com confiança configurável.
 */
export function createMockLlmClient(name: LlmProviderName, confidence = 0.8): LlmClient {
  return {
    name,
    complete({ messages, task }) {
      const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
      const text = user.replace(/<\/?(?:m|fornecedor|cotacao)>/gi, "");
      let value: unknown;
      switch (task) {
        case "optout_intent":
          value = contingencyOptOut(text);
          break;
        case "first_reply_parsing":
          value = contingencyFirstReply(text);
          break;
        case "hidden_fee_scan":
          value = contingencyHiddenFees(text);
          break;
        case "classification": {
          const allowed = /categorias:\s*([^\n]+)/i.exec(messages.map((m) => m.content).join("\n"))?.[1] ?? "";
          value = contingencyClassification(text, allowed.split(",").map((c) => c.trim()).filter(Boolean));
          break;
        }
        case "quotation_extraction":
        case "negotiation":
        case "discovery_search":
        case undefined:
          value = contingencyQuotation(text);
          break;
      }
      const withConfidence = { ...(value as Record<string, unknown>), confidence_score: confidence };
      const content = JSON.stringify(withConfidence);
      return Promise.resolve({ content, inputTokens: Math.ceil(user.length / 4), outputTokens: Math.ceil(content.length / 4) });
    },
  };
}
