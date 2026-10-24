import type { LlmClient } from "@/lib/ai/router";

/** Cliente DeepSeek de teste que devolve um usage fixo e JSON válido. */
export function createLlmClientForTest(usage: { inputTokens: number; outputTokens: number; cacheHitTokens: number }): LlmClient {
  return { name: "deepseek", complete: () => Promise.resolve({ content: '{"ok": true}', ...usage }) };
}
