/**
 * Regras puras da descoberta automática de fornecedores (sem I/O, testáveis).
 */
import { z } from "zod";

import { msUntilBusinessWindow, OUTREACH_WINDOW } from "@/lib/business-days";
import { CATEGORY_LABELS, type CategoryCode, type Unit } from "@/lib/catalog/v1";

/** Meta de coleta: 5 cotações por categoria OU 24h. */
export const QUOTES_TARGET_PER_CATEGORY = 5;
export const COLLECTION_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Contatos por categoria para alcançar ~5 cotações (taxa de resposta ~40%). */
export const MAX_PROSPECTS_PER_CATEGORY = 12;
/** Teto absoluto por evento (protege a reputação do número). */
export const MAX_PROSPECTS_PER_EVENT_AUTO = 120;
export const DAILY_FIRST_CONTACTS_PER_INSTANCE = 50;
export const RECONTACT_MIN_DAYS = 15;
export const BUSINESS_HOURS = { startHour: 9, endHour: 18, timeZone: "America/Sao_Paulo" } as const;
export const OPT_OUT_PAUSE = { minContacted: 10, maxRate: 0.2 } as const;
export const ROUND_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** Candidato bruto vindo de qualquer provedor (ou da ingestão externa). */
export const supplierCandidateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(40),
  phone: z.string().trim().max(40).optional(),
  sourceUrl: z.string().trim().url().max(500),
  websiteUrl: z.string().trim().url().max(500).optional(),
  externalId: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  /** Pista do tipo de negócio (ex.: tags OSM) para a classificação por LLM. */
  hint: z.string().trim().max(120).optional(),
});
export type SupplierCandidate = z.infer<typeof supplierCandidateSchema>;

export function isCategoryCode(value: string): value is CategoryCode {
  return value in CATEGORY_LABELS;
}

/** Normaliza para dedupe (nome + cidade) quando não há telefone. */
export function dedupeKey(name: string, city: string): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${norm(name)}|${norm(city)}`;
}

/** Hora/dia locais (America/Sao_Paulo) sem dependências. */
function localParts(date: Date, timeZone: string): { hour: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { hour: Number(get("hour")), dateKey: `${get("year")}-${get("month")}-${get("day")}` };
}

export function localDateKey(date: Date, timeZone: string = BUSINESS_HOURS.timeZone): string {
  return localParts(date, timeZone).dateKey;
}

/**
 * Horário comercial 8h–20h (Brasília). Retorna 0 se pode enviar agora, ou ms até a próxima abertura.
 * Varre de 15 em 15 min (sem lib de fuso), suficiente para agendar o retry.
 */
export function msUntilBusinessHours(now: Date): number {
  // Contato com fornecedores só em dia útil (seg–sex, sem feriados nacionais), 9h–18h de Brasília.
  return msUntilBusinessWindow(now, OUTREACH_WINDOW);
}

export function collectionEnded(input: {
  startedAt: Date;
  now: Date;
  categories: readonly string[];
  quotesByCategory: Readonly<Record<string, number>>;
}): { ended: boolean; reason?: "time" | "quotes" } {
  if (input.now.getTime() - input.startedAt.getTime() >= COLLECTION_WINDOW_MS)
    return { ended: true, reason: "time" };
  if (
    input.categories.length > 0 &&
    input.categories.every((c) => (input.quotesByCategory[c] ?? 0) >= QUOTES_TARGET_PER_CATEGORY)
  ) {
    return { ended: true, reason: "quotes" };
  }
  return { ended: false };
}

/** Quantos novos fornecedores buscar numa categoria nesta rodada. */
export function categoryNeed(input: {
  quotes: number;
  prospects: number;
  eventProspects: number;
}): number {
  if (input.quotes >= QUOTES_TARGET_PER_CATEGORY) return 0;
  const byCategory = MAX_PROSPECTS_PER_CATEGORY - input.prospects;
  const byEvent = MAX_PROSPECTS_PER_EVENT_AUTO - input.eventProspects;
  return Math.max(0, Math.min(byCategory, byEvent, 5));
}

export function canRecontact(lastContactedAt: Date | null, now: Date): boolean {
  if (lastContactedAt === null) return true;
  return now.getTime() - lastContactedAt.getTime() >= RECONTACT_MIN_DAYS * 24 * 60 * 60 * 1000;
}

export function shouldAutoPause(stats: { contacted: number; optOuts: number }): boolean {
  return (
    stats.contacted >= OPT_OUT_PAUSE.minContacted &&
    stats.optOuts / stats.contacted > OPT_OUT_PAUSE.maxRate
  );
}

export interface FirstContactInput {
  vendorName: string;
  category: string;
  eventTypeLabel: string;
  eventDateIso: string;
  city: string;
  guestCount: number;
  items: { label: string; quantity: number; unit: Unit; notes?: string | null }[];
  specialRequest?: string;
  /** Itens livres do cliente nesta categoria: perguntamos se oferecem exatamente isso. */
  freeItems?: readonly string[];
  sourceProvider: string;
  /** Momento do envio (saudação pelo horário de SP). */
  now?: Date;
}

/**
 * Primeiro contato com detalhes do evento e origem do contato.
 * Texto puro, sem URLs/emojis, ≤ 900. Sem rodapé de opt-out: a conversa
 * precisa soar humana (o opt-out continua sendo detectado nas respostas).
 */
export function renderDiscoveryFirstContact(input: FirstContactInput): string {
  const details = input.specialRequest?.replace(/(https?:\/\/|www\.)\S*/gi, "").trim();
  const notes = input.items
    .map((i) => i.notes?.trim() ?? "")
    .filter((n) => n.length > 0)
    .slice(0, 2)
    .join("; ");
  const extra = [notes, details ?? ""]
    .filter((v) => v.length > 0)
    .join(". ")
    .slice(0, 160);
  const text = [
    "Olá! Aqui é da EventeIA.",
    `Procuramos ${input.category} para ${input.eventTypeLabel} em ${input.city}, para ${String(input.guestCount)} convidados.`,
    extra.length > 0 ? `Detalhes: ${extra}.` : "",
    freeAsk(input.freeItems),
  ]
    .filter((part) => part.length > 0)
    .join(" ");
  return text.length > 900 ? `${text.slice(0, 895).trimEnd()}…` : text;
}

/** "Vocês oferecem exatamente: a; b?" — itens já limpos (lib/catalog/free-items), ≤ 5, ≤ 300. */
export function freeAsk(items: readonly string[] | undefined): string {
  const list = (items ?? [])
    .map((i) => i.replace(/(https?:\/\/|www\.)\S*/gi, "").trim())
    .filter((i) => i.length > 1)
    .slice(0, 5);
  if (list.length === 0) return "";
  return `Vocês oferecem exatamente: ${list.join("; ").slice(0, 300)}?`;
}

export interface SearchCity {
  city: string;
  uf?: string;
}

/** Máximo de cidades de busca por evento (igual ao CHECK da migração 0037). */
export const MAX_SEARCH_CITIES = 10;

/**
 * Cidades onde a descoberta procura: a cidade do evento SEMPRE primeiro,
 * depois as extras escolhidas pelo usuário (sem repetição, teto MAX_SEARCH_CITIES).
 */
export function searchCitiesFor(event: {
  city: string;
  cityUf?: string | null;
  searchCities?: readonly SearchCity[];
}): SearchCity[] {
  const out: SearchCity[] = [];
  const seen = new Set<string>();
  const add = (c: SearchCity) => {
    const city = c.city.trim();
    if (city.length < 2) return;
    const key = `${dedupeKey(city, "")}|${c.uf ?? ""}`;
    if (seen.has(key) || out.length >= MAX_SEARCH_CITIES) return;
    seen.add(key);
    out.push(c.uf !== undefined ? { city, uf: c.uf } : { city });
  };
  add({ city: event.city, ...(event.cityUf ? { uf: event.cityUf } : {}) });
  for (const c of event.searchCities ?? []) add(c);
  return out;
}
