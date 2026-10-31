/**
 * Estágios do processo EventeIA (espelham o CHECK da migração 0026):
 * briefing (entrevista) → discovery (busca de fornecedores) → prospecting (1º contato com o fornecedor)
 * → quote_collection (respostas/cotações) → proposal (cenários entregues) → confirmation.
 */
export const PROCESS_STAGES = ["briefing", "discovery", "prospecting", "quote_collection", "proposal", "confirmation"] as const;
export type ProcessStage = (typeof PROCESS_STAGES)[number];

/**
 * Canais legados (Cloud API/Evolution) mantidos apenas para leitura histórica
 * do consumo. O produto não envia mais por WhatsApp; novas chamadas não usam
 * estes valores.
 */
export const LEGACY_CHANNELS = ["cloud", "evolution"] as const;
export type LegacyChannel = (typeof LEGACY_CHANNELS)[number];

export const STAGE_LABELS: Record<ProcessStage, string> = {
  briefing: "Briefing",
  discovery: "Descoberta",
  prospecting: "Prospecção",
  quote_collection: "Coleta de cotações",
  proposal: "Proposta",
  confirmation: "Confirmação",
};

export const CHANNEL_LABELS: Record<LegacyChannel, string> = {
  cloud: "Cloud (legado)",
  evolution: "Evolution (legado)",
};

export function isProcessStage(v: unknown): v is ProcessStage {
  return typeof v === "string" && (PROCESS_STAGES as readonly string[]).includes(v);
}

export function isLegacyChannel(v: unknown): v is LegacyChannel {
  return typeof v === "string" && (LEGACY_CHANNELS as readonly string[]).includes(v);
}

const TASK_STAGE: Record<string, ProcessStage> = {
  discovery_search: "discovery",
  classification: "discovery",
  optout_intent: "prospecting",
  first_reply_parsing: "quote_collection",
  quotation_extraction: "quote_collection",
  hidden_fee_scan: "quote_collection",
  negotiation: "proposal",
};

/** Estágio padrão quando a chamada não informa (deriva da tarefa do LLM). */
export function defaultStageForTask(task: string): ProcessStage | null {
  return TASK_STAGE[task] ?? null;
}

/** Estágio atual de um evento a partir das colunas de status/timestamps de `events`. */
export function deriveEventStage(e: {
  status: string;
  interview_completed_at: string | null;
  discovery_started_at: string | null;
  collection_ended_at: string | null;
  quotes_delivered_at: string | null;
}): ProcessStage {
  if (e.status === "completed") return "confirmation";
  if (e.quotes_delivered_at !== null || e.collection_ended_at !== null) return "proposal";
  if (e.discovery_started_at !== null) return "quote_collection";
  if (e.interview_completed_at !== null) return "discovery";
  return "briefing";
}
