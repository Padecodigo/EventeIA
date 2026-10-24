import "server-only";

import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { getEmailAdapter } from "./email";
import { recordQuotationsReady, type NotificationDeps, type QuotationsReadyReason } from "./quotations-ready";

/** Dependências reais (service_role — somente servidor/workers). */
export function createNotificationDeps(): NotificationDeps {
  const admin = getSupabaseAdmin();
  return {
    async getOwnerContact(eventId) {
      const { data: event } = await admin
        .from("events")
        .select("owner_profile_id,title")
        .eq("id", eventId)
        .maybeSingle();
      if (event === null) return null;

      const { data: profile } = await admin
        .from("profiles")
        .select("display_name,email")
        .eq("id", event.owner_profile_id)
        .maybeSingle();
      // E-mail salvo no perfil (Google/senha); fallback no auth.users.
      let email = profile?.email ?? null;
      if (email === null) {
        const { data: authUser } = await admin.auth.admin.getUserById(event.owner_profile_id);
        email = authUser.user?.email ?? null;
      }

      return {
        profileId: event.owner_profile_id,
        email,
        displayName: profile?.display_name ?? "",
        eventTitle: event.title,
      };
    },
    async insertNotification(row) {
      const { data, error } = await admin
        .from("notifications")
        .upsert(
          {
            profile_id: row.profileId,
            event_id: row.eventId,
            type: "quotations_ready",
            payload: row.payload,
            idempotency_key: row.idempotencyKey,
          },
          { onConflict: "idempotency_key", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (error !== null) {
        throw new Error(`notifications insert falhou: ${error.code}`);
      }
      return data?.id ?? null;
    },
    async markEmailSent(notificationId) {
      await admin
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", notificationId);
    },
    email: getEmailAdapter(),
    warn(message, context) {
      logger.warn(context, message);
    },
  };
}

export async function notifyQuotationsReady(
  eventId: string,
  reason: QuotationsReadyReason,
): Promise<void> {
  const result = await recordQuotationsReady(createNotificationDeps(), { eventId, reason });
  logger.info({ eventId, reason, result }, "notificação quotations_ready");
}
