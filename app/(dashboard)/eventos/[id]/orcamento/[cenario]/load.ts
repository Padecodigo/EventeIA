import { z } from "zod";

import { kindFromSlug, latestScenarios, type ScenarioSnapshotBreakdown } from "@/lib/quotes/scenarios";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Carrega o snapshot com o client RLS: só o dono do evento enxerga. */
export async function loadScenario(
  id: string,
  slug: string,
): Promise<{ title: string; eventDate: string | null; snap: ScenarioSnapshotBreakdown } | null> {
  const parsed = z.string().uuid().safeParse(id);
  const kind = kindFromSlug(slug);
  if (!parsed.success || kind === null) return null;
  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase.from("events").select("id,title,event_date").eq("id", parsed.data).maybeSingle();
  if (!event) return null;
  const { data: rows } = await supabase
    .from("budget_snapshots")
    .select("breakdown,created_at")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const snap = latestScenarios(rows ?? [])[kind];
  return snap ? { title: event.title, eventDate: event.event_date, snap } : null;
}
