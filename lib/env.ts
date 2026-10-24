import "server-only";

import { z } from "zod";

/**
 * Configuração de ambiente validada com zod.
 * Lida de forma preguiçosa (lazy) para não quebrar o build sem .env.
 * Segredos NUNCA chegam ao client: este módulo é server-only.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  ASAAS_API_URL: z.string().url().default("https://api-sandbox.asaas.com/v3"),
  // Chaves de API podem ser vazias em dev: o .env.example usa "" e o checkout
  // degrada com AsaasNotConfiguredError. "Vazio = não configurado", nunca erro de env.
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().min(16).optional(),
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE: z.string().min(1).optional(),
  EVOLUTION_WEBHOOK_TOKEN: z.string().min(16).optional(),
  B2C_TICKET_PRICE_CENTS: z.coerce.number().int().positive().default(9700),
  // Agente Orçamentista: intervalo humanizado entre disparos (clamp 45–90s no worker).
  WHATSAPP_MIN_INTERVAL_SECONDS: z.coerce.number().int().default(60),
  // Janela de coleta da sessão efêmera (clamp 30–60 min) e concorrência do worker.
  WHATSAPP_COLLECTION_WINDOW_MINUTES: z.coerce.number().int().default(45),
  WHATSAPP_PROSPECTING_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(25),
  // AES-256 (hex 64 chars) p/ credenciais de instância; opcional em dev.
  WHATSAPP_CREDENTIALS_KEY: z.string().optional(),
  ENGINE_TIMEZONE: z.string().default("America/Sao_Paulo"),
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
