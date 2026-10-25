"use server";

import { requireUser } from "@/lib/auth";
import { connectInstance, getConnectionState } from "@/lib/evolution-api/client";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserInstance, resolveInstanceName } from "@/lib/whatsapp/instance-store";
import { supabaseInstanceStore } from "@/lib/whatsapp/instance-store-supabase";
import { InstanceBusyError } from "@/lib/whatsapp/pairing";
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
    async ensureInstanceRow({ userId, eventId }) {
      try {
        const { instance } = await ensureUserInstance(supabaseInstanceStore(), {
          userId,
          eventId,
          onBusy: "throw",
        });
        return instance;
      } catch (caught) {
        if (caught instanceof InstanceBusyError) throw caught;
        logger.error(
          { reason: caught instanceof Error ? caught.message : "?" },
          "falha ao preparar instância (pareamento)",
        );
        throw new Error("instância");
      }
    },
    instanceName: (userId) => resolveInstanceName(supabaseInstanceStore(), userId),
    connect: (instance, digits) => connectInstance(instance, digits),
    connectionState: getConnectionState,
    logError: (message, context) => logger.error(context, message),
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
