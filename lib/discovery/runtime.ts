import "server-only";

import { supplierBlockedAt } from "@/lib/admin/suppliers";
import { ALL_EVENT_TYPES } from "@/lib/catalog/v1";
import type { EventType } from "@/lib/engine/types";
import { serverEnv } from "@/lib/env";
import { findMunicipioByCode } from "@/lib/geo/municipios";
import { enqueue, getQueue, getRedisConnection, QUEUE_NAMES } from "@/lib/queue";
import { msUntilSearchStart } from "@/lib/search-start";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { DiscoveryDeps } from "./engine";
import type { LlmUsageStore } from "./providers/fallback";
import { localDateKey } from "./pure";

const UNITS = new Set(["por_pessoa", "por_hora", "unidade", "pacote"]);

export function discoveryJobId(eventId: string, round: number): string {
  return `discover-${eventId}-r${String(round)}`;
}

/** Enfileira a 1ª rodada (idempotente por jobId). Chamado após pagamento e após a entrevista. */
export async function startDiscovery(eventId: string, now: Date = new Date()): Promise<boolean> {
  // Respeita a data agendada pelo cliente + dia útil 9h–18h: o job nasce atrasado até lá
  // (o worker re-checa na execução) e o prazo da coleta conta a partir do início real.
  const { data } = await getSupabaseAdmin().from("events").select("search_start_date").eq("id", eventId).maybeSingle();
  const startDelay = msUntilSearchStart(now, data?.search_start_date ?? null);
  return enqueue(QUEUE_NAMES.supplierDiscovery, "discover", { eventId, round: 0 }, { jobId: discoveryJobId(eventId, 0), delayMs: startDelay });
}

/**
 * Cliente mudou a data agendada: realinha o job da 1ª rodada (se ainda estiver atrasado) e o prazo da coleta.
 * Sem job pendente não faz nada — a próxima ativação/entrevista enfileira já com a data nova.
 */
export async function rescheduleDiscovery(eventId: string, searchStartDate: string | null, now: Date = new Date()): Promise<boolean> {
  const startDelay = msUntilSearchStart(now, searchStartDate);
  const queue = getQueue(QUEUE_NAMES.supplierDiscovery);
  const job = await queue.getJob(discoveryJobId(eventId, 0));
  if (job === undefined || !(await job.isDelayed())) return false;
  await job.changeDelay(startDelay);
  return true;
}

export function createDiscoveryDeps(): DiscoveryDeps {
  const admin = getSupabaseAdmin();
  const redis = getRedisConnection();
  const env = serverEnv();

  return {
    now: () => new Date(),
    dryRunAll: env.DISCOVERY_DRY_RUN,

    async loadEvent(eventId) {
      const { data: e } = await admin
        .from("events")
        .select("id,title,event_type,event_date,guest_count,city,city_uf,search_city_codes,region_code,status,owner_profile_id,workspace_id,interview_completed_at,discovery_started_at")
        .eq("id", eventId)
        .maybeSingle();
      if (e === null) return null;
      const { data: reqs } = await admin
        .from("event_requirements")
        .select("category,label,quantity,unit,notes")
        .eq("event_id", eventId)
        .eq("selected", true);
      const eventType = (ALL_EVENT_TYPES as string[]).includes(e.event_type) ? (e.event_type as EventType) : "aniversario";
      return {
        id: e.id,
        title: e.title,
        eventType,
        eventDateIso: e.event_date,
        guestCount: e.guest_count,
        city: e.city ?? "",
        cityUf: e.city_uf,
        searchCities: (e.search_city_codes ?? [])
          .map((code) => findMunicipioByCode(code))
          .filter((m) => m !== null)
          .map((m) => ({ city: m.name, uf: m.uf })),
        regionCode: e.region_code,
        status: e.status,
        ownerId: e.owner_profile_id,
        workspaceId: e.workspace_id,
        interviewCompleted: e.interview_completed_at !== null,
        discoveryStartedAt: e.discovery_started_at === null ? null : new Date(e.discovery_started_at),
        requirements: (reqs ?? []).map((r) => ({
          category: r.category,
          label: r.label,
          quantity: r.quantity,
          unit: UNITS.has(r.unit) ? r.unit : "pacote",
          notes: r.notes,
        })),
      };
    },

    async quotesByCategory(eventId) {
      const { data } = await admin.from("quotations").select("category").eq("event_id", eventId);
      const out: Record<string, number> = {};
      for (const q of data ?? []) out[q.category] = (out[q.category] ?? 0) + 1;
      return out;
    },

    async eventProspects(eventId) {
      // Fora do modo dry-run, prospects fictícios (dry_run) não contam para as metas nem bloqueiam números.
      let q = admin.from("vendor_prospects").select("phone_e164,vendor_category,vendor_name").eq("event_id", eventId).is("hidden_at", null);
      if (!env.DISCOVERY_DRY_RUN) q = q.eq("dry_run", false);
      const { data } = await q;
      return (data ?? []).map((p) => ({ phone: p.phone_e164, category: p.vendor_category, name: p.vendor_name }));
    },

    async isPhoneOptedOut(phone) {
      const { data } = await admin
        .from("consents")
        .select("status")
        .eq("phone_e164", phone)
        .eq("channel", "whatsapp")
        .maybeSingle();
      return data?.status === "opted_out";
    },

    async upsertSupplier(c) {
      const nowIso = new Date().toISOString();
      const { data, error } = await admin
        .from("suppliers")
        .upsert(
          {
            name: c.name,
            category: c.category,
            phone_e164: c.phoneE164,
            source_url: c.sourceUrl,
            website_url: c.websiteUrl ?? null,
            external_id: null,
            source_provider: c.provider,
            city: c.city,
            region_code: c.regionCode,
            last_seen_at: nowIso,
            ...(c.viaWhatsappLink ? { whatsapp_verified: true } : {}),
          },
          { onConflict: "phone_e164" },
        )
        .select("id,opt_out_at,last_contacted_at,deleted_at")
        .single();
      if (error !== null || data === null) throw new Error(`falha ao gravar fornecedor (${error?.code ?? "?"})`);
      const blockedAt = supplierBlockedAt(data);
      return {
        id: data.id,
        // Fornecedor excluído pelo admin (lixeira) conta como "não contatar".
        optOutAt: blockedAt === null ? null : new Date(blockedAt),
        lastContactedAt: data.last_contacted_at === null ? null : new Date(data.last_contacted_at),
      };
    },

    async cachedSuppliers({ city, category, excludePhones, limit }) {
      const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      const { data } = await admin
        .from("suppliers")
        .select("name,category,phone_e164,source_url,website_url,source_provider,city")
        .ilike("city", city)
        .eq("category", category)
        .is("opt_out_at", null)
        .is("deleted_at", null)
        .neq("whatsapp_verified", false)
        .neq("source_provider", "mock")
        .gte("last_seen_at", since)
        .limit(limit + excludePhones.length);
      return (data ?? [])
        .filter((s) => s.phone_e164 !== null && !excludePhones.includes(s.phone_e164))
        .slice(0, limit)
        .map((s) => ({
          name: s.name,
          category: s.category,
          phone: s.phone_e164 ?? undefined,
          sourceUrl: s.source_url,
          websiteUrl: s.website_url ?? undefined,
          city: s.city ?? city,
          provider: s.source_provider,
        }));
    },

    ensureInstance(ownerId) {
      // WhatsApp/Evolution removidos: não há instância a conectar.
      return Promise.resolve(`eventeia-${ownerId.slice(0, 8)}`);
    },

    async insertProspect(p) {
      const { data, error } = await admin
        .from("vendor_prospects")
        .insert({
          event_id: p.eventId,
          workspace_id: p.workspaceId,
          supplier_id: p.supplierId,
          vendor_name: p.name,
          vendor_category: p.category,
          phone_e164: p.phoneE164,
          source: p.source,
          source_url: p.sourceUrl,
          dry_run: p.dryRun,
          status: "pending",
        })
        .select("id")
        .single();
      if (error !== null) {
        if (error.code === "23505") return null;
        throw new Error(`falha ao gravar prospect (${error.code})`);
      }
      return data.id;
    },

    async enqueueProspect(job) {
      return enqueue(QUEUE_NAMES.quotationProspecting, "prospect", { ...job }, { jobId: `prospect-${job.prospectId}` });
    },

    async reserveProviderCall(eventId, provider) {
      if (provider === "mock") return true;
      const day = localDateKey(new Date());
      const perEvent = `eventeia:discovery-calls:${eventId}`;
      const daily = `eventeia:discovery-calls-day:${day}`;
      const [ev, dy] = await Promise.all([redis.incr(perEvent), redis.incr(daily)]);
      await Promise.all([redis.expire(perEvent, 7 * 24 * 3600), redis.expire(daily, 2 * 24 * 3600)]);
      return ev <= env.DISCOVERY_MAX_CALLS_PER_EVENT && dy <= env.DISCOVERY_DAILY_CALL_CAP;
    },

    async recordRun(r) {
      await admin.from("supplier_discovery_runs").insert({
        event_id: r.eventId,
        provider: r.provider,
        category: r.category,
        round: r.round,
        found: r.found,
        inserted: r.inserted,
        enqueued: r.enqueued,
        status: r.status,
        error: r.error ?? null,
      });
    },

    async markDiscovery(eventId, patch) {
      await admin
        .from("events")
        .update({
          discovery_status: patch.status,
          ...(patch.startedAt !== undefined ? { discovery_started_at: patch.startedAt.toISOString() } : {}),
          ...(patch.endsAt !== undefined ? { discovery_ends_at: patch.endsAt.toISOString() } : {}),
        })
        .eq("id", eventId);
    },

    async scheduleRound(eventId, round, delayMs) {
      await enqueue(QUEUE_NAMES.supplierDiscovery, "discover", { eventId, round }, { jobId: discoveryJobId(eventId, round), delayMs });
    },
  };
}

/** Uso diário do Grok no Redis (para o switch Grok→NIM). */
export function createRedisLlmUsage(provider = "grok"): LlmUsageStore {
  const redis = getRedisConnection();
  const day = () => localDateKey(new Date());
  const callsKey = () => `eventeia:llm-calls:${provider}:${day()}`;
  const exhaustedKey = () => `eventeia:llm-exhausted:${provider}:${day()}`;
  return {
    async callsToday() {
      return Number((await redis.get(callsKey())) ?? "0");
    },
    async recordCall() {
      await redis.incr(callsKey());
      await redis.expire(callsKey(), 2 * 24 * 3600);
    },
    async isExhausted() {
      return (await redis.get(exhaustedKey())) !== null;
    },
    async markExhausted() {
      await redis.set(exhaustedKey(), "1", "EX", 6 * 3600);
    },
  };
}
