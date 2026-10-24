import { z } from "zod";

import type { LlmClient, LlmProviderName } from "./router";

/** Cliente OpenAI-compatível (/chat/completions) — NIM, xAI e DeepSeek. Sem SDK. */
const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable().optional() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number().int().min(0), completion_tokens: z.number().int().min(0) }).optional(),
});

export const LLM_ENDPOINTS: Record<LlmProviderName, { baseUrl: string; model: string }> = {
  nim: { baseUrl: "https://integrate.api.nvidia.com/v1", model: "nvidia/nemotron-3.5-lightning-30b-a3b" },
  grok: { baseUrl: "https://api.x.ai/v1", model: "grok-4.7" },
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
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
      return { content, inputTokens: parsed.usage?.prompt_tokens, outputTokens: parsed.usage?.completion_tokens };
    },
  };
}
