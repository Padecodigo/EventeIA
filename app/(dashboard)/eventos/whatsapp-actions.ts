"use server";

import { requireUser } from "@/lib/auth";
import { connectInstance, getConnectionState } from "@/lib/evolution-api/client";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkPairing,
  startPairing,
  type PairingDeps,
  type PairingResult,
} from "@/lib/whatsapp/pairing-service";

function deps(): PairingDeps {
  return {
    now: () => Date.now(),
    async ownsEvent(eventId) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.from("events").select("id").eq("id", eventId).maybeSingle();
      return data !== null;
    },
    async ensureInstanceRow({ userId, instance, eventId }) {
      const admin = getSupabaseAdmin();
      const { data } = await admin
        .from("whatsapp_instances")
        .select("id")
        .eq("instance_name", instance)
        .maybeSingle();
      if (data !== null) return;
      const { error } = await admin
        .from("whatsapp_instances")
        .insert({
          profile_id: userId,
          instance_name: instance,
          status: "connecting",
          event_id: eventId,
        });
      if (error !== null) {
        logger.error({ code: error.code }, "falha ao criar instância (pareamento)");
        throw new Error("instância");
      }
    },
    connect: connectInstance,
    connectionState: getConnectionState,
  };
}

/** Gera QR + código de pareamento para o WhatsApp do próprio usuário. */
export async function requestWhatsappPairingAction(
  eventId: string,
  phone: string,
): Promise<PairingResult> {
  const user = await requireUser();
  return startPairing(deps(), { userId: user.id, eventId: String(eventId), phone: String(phone) });
}

/** Polling do estado da conexão (open = conectado). */
export async function whatsappConnectionStateAction(
  eventId: string,
): Promise<{ state: "open" | "connecting" | "close" | "unknown" }> {
  const user = await requireUser();
  return checkPairing(deps(), { userId: user.id, eventId: String(eventId) });
}
