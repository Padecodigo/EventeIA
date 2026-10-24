import { z } from "zod";

import {
  contingencyClassification,
  contingencyFirstReply,
  contingencyHiddenFees,
  contingencyOptOut,
  contingencyQuotation,
} from "./contingency";
import type { LlmClient, LlmProviderName, LlmTask } from "./router";

/** Nome documentado em api-docs.deepseek.com (serve o DeepSeek-V4.1-Flash-1017). */
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";

/** Cliente OpenAI-compatível (/chat/completions) — NIM, xAI e DeepSeek. Sem SDK. */
const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
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
  nim: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
  },
  grok: { baseUrl: "https://api.x.ai/v1", model: "grok-4.7" },
  // Modelo documentado atual (DeepSeek-V4.1-Flash-1017). Sobrescreva com DEEPSEEK_MODEL.
  deepseek: { baseUrl: "https://api.deepseek.com", model: DEFAULT_DEEPSEEK_MODEL },
};

/**
 * DeepSeek V4.x (deepseek-flash) RACIOCINA antes de responder: os reasoning_tokens consomem
 * max_tokens. Com orçamentos pequenos (ex.: 60 na classificação) a resposta vinha vazia
 * (finish_reason "length") e o roteador caía em silêncio no fallback.
 * - Tarefas curtas/estruturadas: thinking desativado (suportado pela API).
 * - Demais: piso de max_tokens para caber raciocínio + resposta.
 * - Resposta vazia por "length": 1 nova tentativa com orçamento maior e thinking desativado; loga.
 */
export const DEEPSEEK_NO_THINKING_TASKS: ReadonlySet<LlmTask> = new Set([
  "classification",
  "optout_intent",
  "first_reply_parsing",
  "hidden_fee_scan",
  "quotation_extraction",
]);
export const DEEPSEEK_MIN_MAX_TOKENS = 2048;
export const EMPTY_RETRY_MAX_TOKENS = 4096;

export class EmptyCompletionError extends Error {
  constructor(
    readonly provider: LlmProviderName,
    readonly finishReason: string | null,
  ) {
    super(`${provider}: resposta vazia (finish_reason=${finishReason ?? "?"})`);
    this.name = "EmptyCompletionError";
  }
}

export function createOpenAiCompatibleClient(options: {
  name: LlmProviderName;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Log estruturado (sem segredos) de respostas vazias/retentativas. */
  onWarn?: (info: Record<string, unknown>, msg: string) => void;
}): LlmClient {
  const baseUrl = (options.baseUrl ?? LLM_ENDPOINTS[options.name].baseUrl).replace(/\/+$/, "");
  const model = options.model ?? LLM_ENDPOINTS[options.name].model;
  const doFetch = options.fetchImpl ?? fetch;
  return {
    name: options.name,
    async complete({ messages, maxTokens, json, task }) {
      const isDeepSeek = options.name === "deepseek";
      const call = async (budget: number, noThinking: boolean) => {
        const res = await doFetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: budget,
            messages,
            ...(isDeepSeek && noThinking ? { thinking: { type: "disabled" } } : {}),
            // NIM nem sempre aceita response_format; a validação zod cobre.
            ...(json && options.name !== "nim" ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`${options.name} HTTP ${String(res.status)}`);
        const parsed = completionSchema.parse(await res.json());
        const choice = parsed.choices[0];
        return {
          parsed,
          content: choice?.message.content ?? "",
          finishReason: choice?.finish_reason ?? null,
        };
      };
      const noThinking = isDeepSeek && task !== undefined && DEEPSEEK_NO_THINKING_TASKS.has(task);
      const budget =
        isDeepSeek && !noThinking ? Math.max(maxTokens, DEEPSEEK_MIN_MAX_TOKENS) : maxTokens;
      let r = await call(budget, noThinking);
      let outTotal = r.parsed.usage?.completion_tokens ?? 0;
      let inTotal = r.parsed.usage?.prompt_tokens ?? 0;
      if (r.content.length === 0) {
        options.onWarn?.(
          { provider: options.name, model, task, maxTokens: budget, finishReason: r.finishReason },
          "LLM resposta vazia",
        );
        if (r.finishReason === "length") {
          const retryBudget = Math.max(budget * 4, EMPTY_RETRY_MAX_TOKENS);
          r = await call(retryBudget, true);
          outTotal += r.parsed.usage?.completion_tokens ?? 0;
          inTotal += r.parsed.usage?.prompt_tokens ?? 0;
          if (r.content.length === 0) {
            options.onWarn?.(
              {
                provider: options.name,
                model,
                task,
                maxTokens: retryBudget,
                finishReason: r.finishReason,
              },
              "LLM resposta vazia após retentativa",
            );
          }
        }
      }
      if (r.content.length === 0) throw new EmptyCompletionError(options.name, r.finishReason);
      return {
        content: r.content,
        inputTokens: r.parsed.usage ? inTotal : undefined,
        outputTokens: r.parsed.usage ? outTotal : undefined,
        cacheHitTokens: r.parsed.usage?.prompt_cache_hit_tokens,
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
      const user = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n");
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
          const allowed =
            /categorias:\s*([^\n]+)/i.exec(messages.map((m) => m.content).join("\n"))?.[1] ?? "";
          value = contingencyClassification(
            text,
            allowed
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
          );
          break;
        }
        case "quotation_extraction":
        case "negotiation":
        case "discovery_search":
        case undefined:
          value = contingencyQuotation(text);
          break;
      }
      const withConfidence = {
        ...(value as Record<string, unknown>),
        confidence_score: confidence,
      };
      const content = JSON.stringify(withConfidence);
      return Promise.resolve({
        content,
        inputTokens: Math.ceil(user.length / 4),
        outputTokens: Math.ceil(content.length / 4),
      });
    },
  };
}
