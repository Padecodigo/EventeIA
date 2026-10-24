import { z } from "zod";

import type { ProcessStage, WhatsAppChannel } from "@/lib/usage/stages";

/**
 * Roteador de LLM provider-agnóstico.
 * - DeepSeek é o CÉREBRO primário (modelo via DEEPSEEK_MODEL): extração de cotação, leitura da
 *   1ª resposta, varredura de taxas ocultas e classificação. NIM é o 1º fallback.
 * - Grok (xAI) é secundário, com teto rígido de XAI_USAGE_SWITCH_PCT (25%) do CUSTO acumulado:
 *   só quando o NIM falha no zod / confidence_score < 0.7, em negociação complexa e em
 *   intenção de opt-out/recusa coloquial. A descoberta com busca ao vivo conta no MESMO teto.
 * - Cadeia: DeepSeek → NIM → Grok (se couber no teto) → contingência determinística. Nunca trava.
 *   Em negociação/opt-out coloquial: DeepSeek → Grok (teto) → NIM → contingência.
 * Custos em micro-dólares inteiros (sem float acumulado).
 */

/** Contexto de cobrança/consumo de uma chamada (todos opcionais). */
export interface UsageMeta {
  eventId?: string;
  reason?: string;
  profileId?: string;
  stage?: ProcessStage;
  channel?: WhatsAppChannel;
}

export type LlmProviderName = "nim" | "grok" | "deepseek";

export type LlmTask =
  | "quotation_extraction"
  | "first_reply_parsing"
  | "hidden_fee_scan"
  | "classification"
  | "negotiation"
  | "optout_intent"
  | "discovery_search";

/** Tarefas em que o Grok vem antes do NIM no fallback (ainda sujeito ao teto). */
export const GROK_PREFERRED_TASKS: ReadonlySet<LlmTask> = new Set([
  "negotiation",
  "optout_intent",
  "discovery_search",
]);

export const MIN_CONFIDENCE = 0.7;

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmCompletion {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  /** DeepSeek: prompt_cache_hit_tokens (parte de inputTokens). */
  cacheHitTokens?: number;
}

export interface LlmClient {
  readonly name: LlmProviderName;
  complete(request: {
    messages: ChatMessage[];
    maxTokens: number;
    json: boolean;
    task?: LlmTask;
  }): Promise<LlmCompletion>;
}

/** Preço por 1M tokens em micro-dólares (US$ 0,20 = 200_000). */
export interface TokenPrice {
  inPer1M: number;
  outPer1M: number;
}

export type PriceTable = Record<LlmProviderName, TokenPrice>;

export const priceTableSchema = z.record(
  z.enum(["nim", "grok", "deepseek"]),
  z.object({ inPer1M: z.number().int().min(0), outPer1M: z.number().int().min(0) }),
);

/** ~4 caracteres por token (pt-BR); estimativa conservadora para checar o teto ANTES da chamada. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function costMicroUsd(price: TokenPrice, inputTokens: number, outputTokens: number): number {
  return Math.ceil((inputTokens * price.inPer1M + outputTokens * price.outPer1M) / 1_000_000);
}

export interface UsageTotals {
  /** Custo acumulado por provedor (micro-USD). */
  costByProvider: Partial<Record<LlmProviderName, number>>;
}

export interface UsageLedger {
  totals(): Promise<UsageTotals>;
  record(entry: {
    provider: LlmProviderName;
    task: LlmTask;
    inputTokens: number;
    outputTokens: number;
    costMicroUsd: number;
    outcome: "ok" | "invalid" | "low_confidence" | "error";
    cacheHitTokens?: number;
    peak?: boolean;
    eventId?: string;
    reason?: string;
    /** Contexto opcional para o painel de consumo (admin/consumo). */
    profileId?: string;
    stage?: ProcessStage;
    channel?: WhatsAppChannel;
  }): Promise<void>;
}

export interface GrokCapConfig {
  /** % máximo do custo acumulado que o Grok pode representar (padrão 25). */
  switchPct: number;
  /** Folga inicial em micro-USD: sem histórico, qualquer chamada passaria de 25%. */
  bootstrapMicroUsd: number;
}

/** O Grok cabe no teto se a fatia dele, contando esta chamada estimada, ficar <= switchPct. */
export function grokWithinCap(
  totals: UsageTotals,
  estimatedMicroUsd: number,
  cfg: GrokCapConfig,
): boolean {
  const grok = (totals.costByProvider.grok ?? 0) + estimatedMicroUsd;
  if (grok <= cfg.bootstrapMicroUsd) return true;
  const all =
    Object.values(totals.costByProvider).reduce((a, b) => a + (b ?? 0), 0) + estimatedMicroUsd;
  return all > 0 && (grok * 100) / all <= cfg.switchPct;
}

/** Ordem de provedores para a tarefa (o teto é checado na hora da chamada). */
export function providerOrder(
  task: LlmTask,
  available: readonly LlmProviderName[],
): LlmProviderName[] {
  const has = (p: LlmProviderName) => available.includes(p);
  // A busca ao vivo da descoberta só existe no Grok; nas demais tarefas o DeepSeek é o primário.
  if (task === "discovery_search") return (["grok", "nim", "deepseek"] as const).filter(has);
  const order: LlmProviderName[] = GROK_PREFERRED_TASKS.has(task)
    ? ["deepseek", "grok", "nim"]
    : ["deepseek", "nim", "grok"];
  return order.filter(has);
}

export interface RouteResult<T> {
  value: T;
  provider: LlmProviderName | "contingency";
  attempts: {
    provider: LlmProviderName;
    outcome: "ok" | "invalid" | "low_confidence" | "error" | "capped";
  }[];
}

export interface Router {
  run<T>(input: {
    task: LlmTask;
    messages: ChatMessage[];
    schema: z.ZodType<T>;
    /** Extrai a confiança (quando o schema tem confidence_score). */
    confidence?: (value: T) => number;
    contingency: () => T;
    maxTokens?: number;
    /** Contexto de cobrança para o painel financeiro. */
    meta?: UsageMeta;
  }): Promise<RouteResult<T>>;
  /** Pergunta ao teto se o Grok pode gastar `estimatedMicroUsd` (usado pela descoberta). */
  grokAllowed(estimatedMicroUsd: number): Promise<boolean>;
  record: UsageLedger["record"];
}

function parseJson(content: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const raw = fenced?.[1] ?? content;
  try {
    return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as unknown;
  } catch {
    return undefined;
  }
}

export function createRouter(options: {
  clients: readonly LlmClient[];
  ledger: UsageLedger;
  prices: PriceTable;
  cap: GrokCapConfig;
  onCapAlert?: (info: { task: LlmTask; estimatedMicroUsd: number }) => void;
  /** Falha de um provedor (erro/vazio/inválido) — logada, nunca silenciosa. */
  onAttemptFailure?: (info: {
    provider: LlmProviderName;
    task: LlmTask;
    outcome: string;
    error?: string;
  }) => void;
  /** Custo real por chamada (ex.: DeepSeek pico/fora de pico + cache). Padrão: tabela simples. */
  cost?: (
    provider: LlmProviderName,
    usage: { inputTokens: number; outputTokens: number; cacheHitTokens: number },
    at: Date,
  ) => { costMicroUsd: number; peak?: boolean } | null;
  now?: () => Date;
}): Router {
  const byName = new Map(options.clients.map((c) => [c.name, c]));
  const grokAllowed = async (est: number) =>
    grokWithinCap(await options.ledger.totals(), est, options.cap);

  return {
    grokAllowed,
    record: (e) => options.ledger.record(e),
    async run({ task, messages, schema, confidence, contingency, maxTokens = 1200, meta }) {
      const attempts: RouteResult<unknown>["attempts"] = [];
      const inEst = estimateTokens(messages.map((m) => m.content).join("\n"));
      for (const name of providerOrder(task, [...byName.keys()])) {
        const client = byName.get(name);
        if (client === undefined) continue;
        const price = options.prices[name];
        if (name === "grok") {
          const est = costMicroUsd(price, inEst, maxTokens);
          if (!(await grokAllowed(est))) {
            attempts.push({ provider: name, outcome: "capped" });
            options.onCapAlert?.({ task, estimatedMicroUsd: est });
            continue;
          }
        }
        let outcome: "ok" | "invalid" | "low_confidence" | "error" = "error";
        let inTok = inEst;
        let outTok = 0;
        let hitTok = 0;
        let failure: string | undefined;
        const entry = (o: "ok" | "invalid" | "low_confidence" | "error") => {
          const usage = { inputTokens: inTok, outputTokens: outTok, cacheHitTokens: hitTok };
          const c = options.cost?.(name, usage, (options.now ?? (() => new Date()))()) ?? {
            costMicroUsd: costMicroUsd(price, inTok, outTok),
          };
          return {
            provider: name,
            task,
            inputTokens: inTok,
            outputTokens: outTok,
            costMicroUsd: c.costMicroUsd,
            outcome: o,
            cacheHitTokens: hitTok,
            peak: c.peak,
            eventId: meta?.eventId,
            reason: meta?.reason ?? task,
            profileId: meta?.profileId,
            stage: meta?.stage,
            channel: meta?.channel,
          };
        };
        try {
          const res = await client.complete({ messages, maxTokens, json: true, task });
          inTok = res.inputTokens ?? inEst;
          outTok = res.outputTokens ?? estimateTokens(res.content);
          hitTok = Math.min(res.cacheHitTokens ?? 0, inTok);
          const parsed = schema.safeParse(parseJson(res.content));
          if (!parsed.success) outcome = "invalid";
          else if (confidence !== undefined && confidence(parsed.data) < MIN_CONFIDENCE)
            outcome = "low_confidence";
          else {
            outcome = "ok";
            await options.ledger.record(entry(outcome));
            attempts.push({ provider: name, outcome });
            return { value: parsed.data, provider: name, attempts };
          }
        } catch (err) {
          outcome = "error";
          failure = err instanceof Error ? err.message : String(err);
        }
        options.onAttemptFailure?.({
          provider: name,
          task,
          outcome,
          ...(failure !== undefined ? { error: failure } : {}),
        });
        await options.ledger.record(entry(outcome));
        attempts.push({ provider: name, outcome });
      }
      return { value: contingency(), provider: "contingency", attempts };
    },
  };
}

/** Ledger em memória (testes/dev). */
export function createMemoryLedger(): UsageLedger & {
  entries: Parameters<UsageLedger["record"]>[0][];
} {
  const entries: Parameters<UsageLedger["record"]>[0][] = [];
  return {
    entries,
    totals() {
      const costByProvider: Partial<Record<LlmProviderName, number>> = {};
      for (const e of entries)
        costByProvider[e.provider] = (costByProvider[e.provider] ?? 0) + e.costMicroUsd;
      return Promise.resolve({ costByProvider });
    },
    record(e) {
      entries.push(e);
      return Promise.resolve();
    },
  };
}
