import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { InstanceStore } from "./instance-store";

/** InstanceStore sobre whatsapp_instances (service role). */
export function supabaseInstanceStore(): InstanceStore {
  const admin = getSupabaseAdmin();
  return {
    async findByOwner(userId) {
      const { data, error } = await admin
        .from("whatsapp_instances")
        .select("id,instance_name,event_id,status")
        .eq("profile_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error !== null) throw new Error(`whatsapp_instances: ${error.code}`);
      return data;
    },
    async insert(row) {
      const { error } = await admin.from("whatsapp_instances").insert(row);
      if (error !== null) throw new Error(`whatsapp_instances insert: ${error.code}`);
    },
    async rebind(id, eventId) {
      const { error } = await admin
        .from("whatsapp_instances")
        .update({ event_id: eventId, status: "connecting" })
        .eq("id", id);
      if (error !== null) throw new Error(`whatsapp_instances rebind: ${error.code}`);
    },
  };
}
