import "server-only";

import { randomUUID } from "node:crypto";

import { logger } from "@/lib/logger";
import { getEmailAdapter } from "@/lib/notifications/email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hashIdentifier } from "@/lib/welcome/pure";

import { SupportRateLimitedError, type SupportDeps } from "./service";

const SUPPORT_BUCKET = "support-attachments";
const TICKET_COLUMNS = "id,user_id,email,type,subject,status,priority";

function rateSalt(): string {
  const salt = process.env.WELCOME_HASH_SALT;
  // Sem salt (dev): ainda limita, com salt fixo local — nunca grava IP bruto.
  return salt !== undefined && salt.length >= 16 ? salt : "eventeia-dev-support-salt";
}

/** Dependências reais (service_role — somente servidor, após requireUser/requireAdmin). */
export function createSupportDeps(): SupportDeps {
  const admin = getSupabaseAdmin();
  return {
    async rateHit(key, limit) {
      const { error } = await admin.rpc("support_rate_hit", {
        p_key_hash: hashIdentifier("ip", key, rateSalt()),
        p_limit: limit,
      });
      if (error !== null) {
        if (error.message.includes("rate_limited")) throw new SupportRateLimitedError();
        throw new Error(`support_rate_hit falhou: ${error.code}`);
      }
    },
    async eventOwnedBy(eventId, userId) {
      const { data } = await admin
        .from("events")
        .select("id")
        .eq("id", eventId)
        .eq("owner_profile_id", userId)
        .maybeSingle();
      return data !== null;
    },
    async uploadAttachment(path, file, contentType) {
      const { error } = await admin.storage.from(SUPPORT_BUCKET).upload(path, file, { contentType, upsert: false });
      if (error !== null) logger.warn({ reason: error.message }, "anexo de atendimento falhou");
      return error === null;
    },
    async insertTicket(row) {
      const { data, error } = await admin.from("support_tickets").insert(row).select(TICKET_COLUMNS).single();
      if (error !== null) {
        if (error.message.includes("rate_limited")) throw new SupportRateLimitedError();
        throw new Error(`support_tickets insert falhou: ${error.code}`);
      }
      return data;
    },
    async getTicket(id) {
      const { data } = await admin.from("support_tickets").select(TICKET_COLUMNS).eq("id", id).maybeSingle();
      return data;
    },
    async insertMessage(row) {
      const { error } = await admin.from("support_ticket_messages").insert(row);
      if (error !== null) throw new Error(`support_ticket_messages insert falhou: ${error.code}`);
    },
    async updateTicket(id, patch) {
      const { error } = await admin.from("support_tickets").update(patch).eq("id", id);
      if (error !== null) throw new Error(`support_tickets update falhou: ${error.code}`);
    },
    async contactEmail(ticket) {
      if (ticket.user_id === null) return ticket.email;
      const { data } = await admin.from("profiles").select("email").eq("id", ticket.user_id).maybeSingle();
      if (data?.email) return data.email;
      const { data: authUser } = await admin.auth.admin.getUserById(ticket.user_id);
      return authUser.user?.email ?? null;
    },
    newId: () => randomUUID(),
    email: getEmailAdapter(),
    adminEmail: process.env.SUPPORT_ADMIN_EMAIL?.trim() || null,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    warn(message, context) {
      logger.warn(context, message);
    },
  };
}

/** URL assinada (10 min) para o admin ver a captura de tela. */
export async function signedAttachmentUrl(path: string | null): Promise<string | null> {
  if (path === null) return null;
  const { data } = await getSupabaseAdmin().storage.from(SUPPORT_BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
