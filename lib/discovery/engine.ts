/**
 * Orquestração da descoberta (pipeline em streaming): busca → valida telefone →
 * dedupe → grava → enfileira prospecção IMEDIATAMENTE, candidato a candidato.
 * Sem I/O direto: tudo via `DiscoveryDeps` (Supabase/Redis em runtime, fakes em testes).
 */
import type { Unit } from "@/lib/catalog/v1";
import { CATEGORY_LABELS, EVENT_TYPE_LABELS } from "@/lib/catalog/v1";
import type { EventType } from "@/lib/engine/types";
import { parseBrazilPhone } from "@/lib/phone";

import type { DiscoveryProvider } from "./providers/types";
import {
  canRecontact,
  categoryNeed,
  COLLECTION_WINDOW_MS,
  collectionEnded,
  isCategoryCode,
  renderDiscoveryFirstContact,
  ROUND_INTERVAL_MS,
  searchCitiesFor,
  type SearchCity,
  supplierCandidateSchema,
  type SupplierCandidate,
} from "./pure";

export interface DiscoveryEvent {
  id: string;
  title: string;
  eventType: EventType;
  eventDateIso: string;
  guestCount: number;
  /**
   * Orçamento limite do evento (0072, centavos, total). Contexto interno da
   * prospecção: NÃO é revelado ao fornecedor no primeiro contato (negociação/LGPD).
   */
  budgetLimitCents?: number | null;
  city: string;
  /** UF do município do evento (IBGE); null em eventos legados. */
  cityUf?: string | null;
  /** Cidades extras escolhidas pelo usuário (a do evento é sempre incluída). */
  searchCities?: SearchCity[];
  regionCode: string;
  status: string;
  ownerId: string;
  workspaceId: string | null;
  interviewCompleted: boolean;
  discoveryStartedAt: Date | null;
  requirements: { category: string; label: string; quantity: number; unit: Unit; notes: string | null }[];
}

export interface SupplierRecord {
  id: string;
  optOutAt: Date | null;
  lastContactedAt: Date | null;
}

export interface ProspectJobInput {
  prospectId: string;
  eventId: string;
  instance: string;
  phoneE164: string;
  vendorName: string;
  eventTitle: string;
  eventType: string;
  eventDateIso: string;
  city: string;
  guestCount: number;
  /** Orçamento limite do evento (contexto interno para a extração/curadoria). */
  budgetLimitCents?: number | null;
  category: string;
  messageText: string;
  dryRun: boolean;
  supplierId: string;
}

export interface DiscoveryDeps {
  now(): Date;
  loadEvent(eventId: string): Promise<DiscoveryEvent | null>;
  quotesByCategory(eventId: string): Promise<Record<string, number>>;
  eventProspects(eventId: string): Promise<{ phone: string; category: string; name: string }[]>;
  isPhoneOptedOut(phone: string): Promise<boolean>;
  upsertSupplier(c: {
    name: string;
    category: string;
    phoneE164: string;
    sourceUrl: string;
    websiteUrl?: string;
    externalId?: string;
    provider: string;
    city: string;
    regionCode: string;
  }): Promise<SupplierRecord>;
  cachedSuppliers(q: { city: string; category: string; excludePhones: string[]; limit: number }): Promise<
    (SupplierCandidate & { provider: string })[]
  >;
  ensureInstance(ownerId: string, eventId: string): Promise<string>;
  insertProspect(p: {
    eventId: string;
    workspaceId: string | null;
    supplierId: string;
    name: string;
    category: string;
    phoneE164: string;
    sourceUrl: string;
    source: "auto" | "ingest";
    dryRun: boolean;
  }): Promise<string | null>;
  enqueueProspect(job: ProspectJobInput): Promise<boolean>;
  reserveProviderCall(eventId: string, provider: string): Promise<boolean>;
  recordRun(r: {
    eventId: string;
    provider: string;
    category: string;
    round: number;
    found: number;
    inserted: number;
    enqueued: number;
    status: "ok" | "error" | "skipped";
    error?: string;
  }): Promise<void>;
  markDiscovery(eventId: string, patch: { startedAt?: Date; endsAt?: Date; status: "running" | "completed" | "paused" }): Promise<void>;
  scheduleRound(eventId: string, round: number, delayMs: number): Promise<void>;
  dryRunAll: boolean;
}

const EMOJI_OR_URL = /(https?:\/\/\S+|www\.\S+|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}])/gu;

export function sanitizeVendorName(name: string): string {
  return name.replace(EMOJI_OR_URL, "").replace(/!{2,}/g, "!").replace(/\s+/g, " ").trim().slice(0, 80);
}

export type IngestOutcome =
  | "enqueued"
  | "invalid"
  | "no_phone"
  | "duplicate"
  | "opted_out"
  | "recent_contact"
  | "queue_down";

export interface IngestContext {
  event: DiscoveryEvent;
  instance: string;
  provider: string;
  source: "auto" | "ingest";
  knownPhones: Set<string>;
}

/** Um candidato: valida, deduplica, grava e enfileira. */
export async function ingestCandidate(
  deps: DiscoveryDeps,
  ctx: IngestContext,
  raw: unknown,
): Promise<IngestOutcome> {
  const parsed = supplierCandidateSchema.safeParse(raw);
  if (!parsed.success) return "invalid";
  const c = parsed.data;
  const name = sanitizeVendorName(c.name);
  if (name.length < 2) return "invalid";

  const direct = c.phone !== undefined ? parseBrazilPhone(c.phone) : null;
  if (direct === null) return "no_phone";
  const phone = direct.e164;

  if (ctx.knownPhones.has(phone)) return "duplicate";
  if (await deps.isPhoneOptedOut(phone)) return "opted_out";

  const category = isCategoryCode(c.category) ? c.category : "outros";
  const supplier = await deps.upsertSupplier({
    name,
    category,
    phoneE164: phone,
    sourceUrl: c.sourceUrl,
    websiteUrl: c.websiteUrl,
    externalId: c.externalId,
    provider: ctx.provider,
    city: c.city ?? ctx.event.city,
    regionCode: ctx.event.regionCode,
  });
  if (supplier.optOutAt !== null) return "opted_out";
  if (!canRecontact(supplier.lastContactedAt, deps.now())) return "recent_contact";

  const dryRun = deps.dryRunAll || ctx.provider === "mock";
  const prospectId = await deps.insertProspect({
    eventId: ctx.event.id,
    workspaceId: ctx.event.workspaceId,
    supplierId: supplier.id,
    name,
    category,
    phoneE164: phone,
    sourceUrl: c.sourceUrl,
    source: ctx.source,
    dryRun,
  });
  ctx.knownPhones.add(phone);
  if (prospectId === null) return "duplicate";

  const items = ctx.event.requirements.filter((r) => r.category === category);
  const special = ctx.event.requirements.find((r) => r.category === "outros")?.notes ?? undefined;
  const messageText = renderDiscoveryFirstContact({
    vendorName: name,
    category,
    eventTypeLabel: EVENT_TYPE_LABELS[ctx.event.eventType].split(" (")[0] ?? ctx.event.eventType,
    eventDateIso: ctx.event.eventDateIso,
    city: ctx.event.city,
    guestCount: ctx.event.guestCount,
    items,
    specialRequest: category === "outros" ? special : undefined,
    sourceProvider: ctx.provider,
  });

  const ok = await deps.enqueueProspect({
    prospectId,
    eventId: ctx.event.id,
    instance: ctx.instance,
    phoneE164: phone,
    vendorName: name,
    eventTitle: ctx.event.title,
    eventType: ctx.event.eventType,
    eventDateIso: ctx.event.eventDateIso,
    city: ctx.event.city.slice(0, 60),
    guestCount: ctx.event.guestCount,
    budgetLimitCents: ctx.event.budgetLimitCents ?? null,
    category,
    messageText,
    dryRun,
    supplierId: supplier.id,
  });
  return ok ? "enqueued" : "queue_down";
}

export interface RoundSummary {
  status: "not_ready" | "ended" | "running";
  reason?: string;
  perCategory: Record<string, { found: number; enqueued: number; providers: string[] }>;
}

/** Uma rodada: para cada categoria da entrevista, completa a necessidade (cache global → provedores). */
export async function runDiscoveryRound(
  deps: DiscoveryDeps,
  providers: readonly DiscoveryProvider[],
  input: { eventId: string; round: number },
): Promise<RoundSummary> {
  const event = await deps.loadEvent(input.eventId);
  const summary: RoundSummary = { status: "running", perCategory: {} };
  if (event === null || event.status !== "active" || !event.interviewCompleted || event.city.length < 2) {
    return { ...summary, status: "not_ready" };
  }
  const now = deps.now();
  const startedAt = event.discoveryStartedAt ?? now;
  if (event.discoveryStartedAt === null) {
    await deps.markDiscovery(event.id, { startedAt, endsAt: new Date(startedAt.getTime() + COLLECTION_WINDOW_MS), status: "running" });
  }

  const categories = [...new Set(event.requirements.map((r) => r.category))];
  const quotes = await deps.quotesByCategory(event.id);
  const end = collectionEnded({ startedAt, now, categories: categories.filter((c) => c !== "outros"), quotesByCategory: quotes });
  if (end.ended) {
    await deps.markDiscovery(event.id, { status: "completed" });
    return { ...summary, status: "ended", reason: end.reason };
  }

  const instance = await deps.ensureInstance(event.ownerId, event.id);
  const prospects = await deps.eventProspects(event.id);
  const knownPhones = new Set(prospects.map((p) => p.phone));
  let eventCount = prospects.length;

  for (const category of categories) {
    const stats = { found: 0, enqueued: 0, providers: [] as string[] };
    summary.perCategory[category] = stats;
    let need = categoryNeed({
      quotes: quotes[category] ?? 0,
      prospects: prospects.filter((p) => p.category === category).length,
      eventProspects: eventCount,
    });
    if (need === 0) continue;

    const consume = async (provider: string, candidates: unknown[]) => {
      const ctx: IngestContext = { event, instance, provider, source: "auto", knownPhones };
      let inserted = 0;
      let enqueued = 0;
      for (const cand of candidates) {
        if (need <= 0) break;
        const outcome = await ingestCandidate(deps, ctx, cand);
        if (outcome === "enqueued" || outcome === "queue_down") {
          inserted += 1;
          eventCount += 1;
          need -= 1;
        }
        if (outcome === "enqueued") enqueued += 1;
      }
      stats.found += candidates.length;
      stats.enqueued += enqueued;
      if (candidates.length > 0) stats.providers.push(provider);
      return { inserted, enqueued };
    };

    // 1) Cache global (reuso entre eventos/cidades, custo zero).
    const cities = searchCitiesFor(event);
    for (const sc of cities) {
      if (need <= 0) break;
      const cached = await deps.cachedSuppliers({ city: sc.city, category, excludePhones: [...knownPhones], limit: need });
      for (const c of cached) await consume(c.provider, [c]);
    }

    // 2) Provedores ao vivo, em ordem de prioridade.
    const label = isCategoryCode(category) ? CATEGORY_LABELS[category] : category;
    const freeText = category === "outros" ? event.requirements.find((r) => r.category === "outros")?.notes ?? undefined : undefined;
    for (const sc of cities) {
      if (need <= 0) break;
      for (const provider of providers) {
        if (need <= 0) break;
        if (!(await deps.reserveProviderCall(event.id, provider.name))) {
          await deps.recordRun({ eventId: event.id, provider: provider.name, category, round: input.round, found: 0, inserted: 0, enqueued: 0, status: "skipped", error: "cap" });
          continue;
        }
        try {
          const results = await provider.search({
            category,
            categoryLabel: label,
            city: sc.city,
            uf: sc.uf,
            eventTypeLabel: EVENT_TYPE_LABELS[event.eventType],
            freeText,
            limit: need,
            exclude: [...knownPhones],
          });
          const used = provider.lastUsed ?? provider.name;
          const r = await consume(used, results);
          await deps.recordRun({ eventId: event.id, provider: used, category, round: input.round, found: results.length, inserted: r.inserted, enqueued: r.enqueued, status: "ok" });
        } catch (error) {
          await deps.recordRun({
            eventId: event.id, provider: provider.lastUsed ?? provider.name, category, round: input.round, found: 0, inserted: 0, enqueued: 0,
            status: "error", error: error instanceof Error ? error.message.slice(0, 200) : "erro",
          });
        }
      }
    }
  }

  // Continua procurando fornecedores NOVOS até 5 cotações/categoria ou 24h.
  await deps.scheduleRound(event.id, input.round + 1, ROUND_INTERVAL_MS);
  return summary;
}

export type IngestBatchResult =
  | { ok: false; reason: "not_ready" }
  | { ok: true; outcomes: Record<IngestOutcome, number> };

/** Ingestão externa (agente/DeepSeek/etc.): mesmas regras da descoberta automática. */
export async function ingestBatch(
  deps: DiscoveryDeps,
  input: { eventId: string; provider: string; suppliers: readonly unknown[] },
): Promise<IngestBatchResult> {
  const event = await deps.loadEvent(input.eventId);
  if (event === null || event.status !== "active" || !event.interviewCompleted || event.city.length < 2) {
    return { ok: false, reason: "not_ready" };
  }
  const instance = await deps.ensureInstance(event.ownerId, event.id);
  const prospects = await deps.eventProspects(event.id);
  const ctx: IngestContext = {
    event,
    instance,
    provider: input.provider,
    source: "ingest",
    knownPhones: new Set(prospects.map((p) => p.phone)),
  };
  const outcomes: Record<IngestOutcome, number> = {
    enqueued: 0,
    invalid: 0,
    no_phone: 0,
    duplicate: 0,
    opted_out: 0,
    recent_contact: 0,
    queue_down: 0,
  };
  for (const raw of input.suppliers) {
    outcomes[await ingestCandidate(deps, ctx, raw)] += 1;
  }
  return { ok: true, outcomes };
}
