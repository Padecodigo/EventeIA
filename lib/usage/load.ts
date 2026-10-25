import "server-only";

import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { rowBrlCents, type ClosedOutsideRow, type UsageFilters, type UsageRow } from "./report";

const MAX_ROWS = 20_000;

export interface UsageData {
  rows: UsageRow[];
  closedOutside: ClosedOutsideRow[];
  userLabels: Record<string, string>;
  eventTitles: Record<string, string>;
  truncated: boolean;
}

/**
 * Somente admin (requireAdmin + RLS is_admin()). Filtros de data/tarefa/provedor/estágio vão para a query;
 * usuário e canal são filtrados depois porque linhas antigas herdam dono/canal do evento.
 */
export async function loadUsage(f: UsageFilters): Promise<UsageData> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const start = `${f.from}T00:00:00Z`;
  const end = `${f.to}T23:59:59.999Z`;

  let q = supabase
    .from("llm_usage_events")
    .select("created_at,provider,task,outcome,profile_id,event_id,stage,whatsapp_channel,input_tokens,output_tokens,cost_micro_usd,cost_brl_cents,fx_brl_per_usd_micro")
    .is("deleted_at", null)
    .gte("created_at", start)
    .lte("created_at", end);
  if (f.task !== undefined) q = q.eq("task", f.task);
  if (f.provider !== undefined) q = q.eq("provider", f.provider);
  if (f.stage === "none") q = q.is("stage", null);
  else if (f.stage !== undefined) q = q.eq("stage", f.stage);

  const [llm, outcomes] = await Promise.all([
    q.order("created_at", { ascending: false }).limit(MAX_ROWS),
    supabase
      .from("event_outcomes")
      .select("event_id,closed_outside_at,closed_outside_stage,whatsapp_channel")
      .eq("closed_outside", true)
      .gte("closed_outside_at", start)
      .lte("closed_outside_at", end)
      .order("closed_outside_at", { ascending: false })
      .limit(1000),
  ]);
  const raw = llm.data ?? [];
  const closedRaw = outcomes.data ?? [];

  const eventIds = [
    ...new Set([...raw.map((r) => r.event_id), ...closedRaw.map((r) => r.event_id)].filter((e): e is string => e !== null)),
  ].slice(0, 1000);
  const events = eventIds.length > 0
    ? await getSupabaseAdmin().from("events").select("id,title,owner_profile_id,whatsapp_channel").in("id", eventIds)
    : { data: [] as { id: string; title: string; owner_profile_id: string; whatsapp_channel: "cloud" | "evolution" | null }[] };
  const byEvent = new Map((events.data ?? []).map((e) => [e.id, e]));

  const rows: UsageRow[] = raw.map((r) => {
    const ev = r.event_id === null ? undefined : byEvent.get(r.event_id);
    return {
      at: r.created_at,
      provider: r.provider,
      task: r.task,
      outcome: r.outcome,
      profileId: r.profile_id ?? ev?.owner_profile_id ?? null,
      eventId: r.event_id,
      stage: r.stage,
      channel: r.whatsapp_channel ?? ev?.whatsapp_channel ?? null,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costMicroUsd: r.cost_micro_usd,
      costBrlCents: rowBrlCents(r.cost_micro_usd, r.cost_brl_cents, r.fx_brl_per_usd_micro),
    };
  });

  const profileIds = [...new Set(rows.map((r) => r.profileId).filter((p): p is string => p !== null))].slice(0, 500);
  const profiles = profileIds.length > 0
    ? await supabase.from("profiles").select("id,display_name").in("id", profileIds)
    : { data: [] as { id: string; display_name: string }[] };

  return {
    rows,
    closedOutside: closedRaw.map((r) => ({
      eventId: r.event_id,
      at: r.closed_outside_at ?? "",
      stage: r.closed_outside_stage,
      channel: r.whatsapp_channel ?? byEvent.get(r.event_id)?.whatsapp_channel ?? null,
    })),
    userLabels: Object.fromEntries((profiles.data ?? []).map((p) => [p.id, p.display_name])),
    eventTitles: Object.fromEntries((events.data ?? []).map((e) => [e.id, e.title])),
    truncated: raw.length >= MAX_ROWS,
  };
}
