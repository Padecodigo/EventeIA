import "server-only";

import { ENGINE_VERSION } from "@/lib/engine";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

import type { DeliveryDeps } from "./delivery";

export function createDeliveryDeps(): DeliveryDeps {
  const admin = getSupabaseAdmin();
  return {
    engineVersion: ENGINE_VERSION,
    async claim(eventId) {
      const { data } = await admin
        .from("events")
        .update({ quotes_delivered_at: new Date().toISOString() })
        .eq("id", eventId)
        .is("quotes_delivered_at", null)
        .select("id");
      return (data ?? []).length > 0;
    },
    async release(eventId) {
      await admin.from("events").update({ quotes_delivered_at: null }).eq("id", eventId);
    },
    async load(eventId) {
      const [{ data: reqs }, { data: quotes }, { data: ev }] = await Promise.all([
        admin
          .from("event_requirements")
          .select("category")
          .eq("event_id", eventId)
          .eq("selected", true),
        admin
          .from("quotations")
          .select(
            "id,category,vendor_name,vendor_contact,amount_cents,fees_cents,confidence,needs_followup,extraction",
          )
          .eq("event_id", eventId)
          .eq("status", "draft")
          .order("id", { ascending: true }),
        admin.from("events").select("guest_count").eq("id", eventId).maybeSingle(),
      ]);
      return {
        requirements: reqs ?? [],
        guestCount: Number(ev?.guest_count ?? 0),
        quotations: (quotes ?? []).map((q) => ({
          ...q,
          confidence: q.confidence === null ? null : Number(q.confidence),
        })),
      };
    },
    async insertSnapshots(rows) {
      const { error } = await admin
        .from("budget_snapshots")
        .insert(rows.map((r) => ({ ...r, breakdown: r.breakdown as unknown as Json })));
      if (error !== null) throw new Error(`falha ao gravar cenários (${error.code})`);
    },
  };
}
