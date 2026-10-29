import "server-only";

import { z } from "zod";

/**
 * Configuração de ambiente validada com zod.
 * Lida de forma preguiçosa (lazy) para não quebrar o build sem .env.
 * Segredos NUNCA chegam ao client: este módulo é server-only.
 */
/**
 * Os docker-compose passam `${VAR:-}`: variável ausente chega como "".
 * Sem isto, "" vira 0 (`Number("")`) e derruba o default numérico
 * (ex.: janela de coleta viraria 30 min em vez de 24 h).
 */
const emptyToUndefined = (raw: unknown): unknown =>
  typeof raw === "string" && raw.trim() === "" ? undefined : raw;

const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  // sandbox (padrão) → https://sandbox.asaas.com/api/v3 · production → https://api.asaas.com/v3
  ASAAS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  // Override opcional (compatibilidade); vazio = usa ASAAS_ENVIRONMENT.
  ASAAS_API_URL: z.string().url().optional().or(z.literal("")),
  // Chaves de API podem ser vazias em dev: o .env.example usa "" e o checkout
  // degrada com AsaasNotConfiguredError. "Vazio = não configurado", nunca erro de env.
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().min(16).optional(),
  // Meta — Instagram Direct + Messenger (respostas, janela 24h; não há abordagem fria).
  META_ACCESS_TOKEN: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  META_PAGE_ID: z.string().optional(),
  META_INSTAGRAM_BUSINESS_ID: z.string().optional(),
  META_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  // Host da Graph API: Facebook Login usa graph.facebook.com; Instagram Login usa graph.instagram.com.
  META_API_HOST: z.enum(["graph.facebook.com", "graph.instagram.com"]).default("graph.facebook.com"),
  // Palavra-chave que o fornecedor comenta para receber a cotação na DM.
  META_PROSPECT_KEYWORD: z.string().min(1).default("cotação"),
  // Publicação Instagram: graph (API oficial) | browser (sessão logada, grokbot-style).
  INSTAGRAM_PROVIDER: z.enum(["graph", "browser"]).default("graph"),
  /** storageState (cookies) da sessão logada no Instagram (volume no worker). */
  INSTAGRAM_SESSION_FILE: z.string().default(".data/instagram-session.json"),
  INSTAGRAM_BROWSER_HEADLESS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Prospecção: posts de isca (aprovação humana por padrão) e imagem SDXL.
  REQUIRE_APPROVAL: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  MAX_POSTS_PER_DAY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(50).default(2)),
  MAX_TAGS_PER_POST: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20).default(8)),
  MIN_POST_INTERVAL_MINUTES: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(60)),
  MODELSLAB_API_KEY: z.string().optional(),
  // Notificação de escalonamento da prospecção (opcional).
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  B2C_TICKET_PRICE_CENTS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(9700)),
  ENGINE_TIMEZONE: z.string().default("America/Sao_Paulo"),
  // Descoberta automática de fornecedores (Fase 2).
  XAI_API_KEY: z.string().optional(),
  XAI_MODEL: z.string().optional(),
  DISCOVERY_PROVIDERS: z.string().optional(),
  DISCOVERY_INGEST_SECRET: z.string().min(32).optional().or(z.literal("")),
  // true = nunca envia WhatsApp (testes/homologação): prospects ficam dry_run.
  DISCOVERY_DRY_RUN: z
    .enum(["true", "false", "1", "0", ""])
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  DISCOVERY_MAX_CALLS_PER_EVENT: z.coerce.number().int().min(1).max(500).default(40),
  DISCOVERY_DAILY_CALL_CAP: z.coerce.number().int().min(1).max(10000).default(300),
  // Fallback LLM: NVIDIA NIM (OpenAI-compatível). Sem busca ao vivo — só estrutura/valida.
  NVIDIA_NIM_API_KEY: z.string().optional(),
  /** Provedor de imagem: modelslab (padrão) ou nvidia (NIM GenAI). */
  IMAGE_PROVIDER: z.enum(["modelslab", "nvidia"]).default("modelslab"),
  NVIDIA_IMAGE_MODEL: z.string().default("black-forest-labs/flux-3-image-klein"),
  NIM_MODEL: z.string().optional(),
  // Orçamento diário de chamadas Grok e % de uso a partir do qual troca para o NIM.
  XAI_DAILY_BUDGET: z.coerce.number().int().min(1).max(100000).default(200),
  XAI_USAGE_SWITCH_PCT: z.coerce.number().min(0).max(100).default(25),
  // Roteador de LLM (lib/ai/router.ts): preços por 1M tokens em micro-USD (US$ 1 = 1_000_000).
  AI_PRICE_NIM_IN_PER_1M: z.coerce.number().int().min(0).default(100_000),
  AI_PRICE_NIM_OUT_PER_1M: z.coerce.number().int().min(0).default(400_000),
  AI_PRICE_GROK_IN_PER_1M: z.coerce.number().int().min(0).default(3_000_000),
  AI_PRICE_GROK_OUT_PER_1M: z.coerce.number().int().min(0).default(15_000_000),
  AI_PRICE_DEEPSEEK_IN_PER_1M: z.coerce.number().int().min(0).default(300_000),
  AI_PRICE_DEEPSEEK_OUT_PER_1M: z.coerce.number().int().min(0).default(1_200_000),
  // Folga inicial do Grok (sem histórico qualquer chamada passaria de 25%) e custo estimado por busca ao vivo.
  AI_GROK_BOOTSTRAP_MICROUSD: z.coerce.number().int().min(0).default(200_000),
  AI_GROK_SEARCH_CALL_MICROUSD: z.coerce.number().int().min(0).default(30_000),
  AI_USE_DEEPSEEK: z.enum(["true", "false", ""]).default("true").transform((v) => v !== "false"),
  // Central de atendimento: destino dos alertas imediatos (problema/urgente). Vazio = sem alerta.
  SUPPORT_ADMIN_EMAIL: z.string().email().optional().or(z.literal("")),
});

/** Chave de API presente e não vazia (vazio = não configurado). Type guard. */
export function isConfigured(key: string | undefined): key is string {
  return key !== undefined && key.length > 0;
}

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached !== undefined) {
    return cached;
  }
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuração de ambiente inválida — ${problems}`);
  }
  cached = parsed.data;
  return cached;
}
