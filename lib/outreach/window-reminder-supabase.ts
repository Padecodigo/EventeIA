import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";
import { sendInstagramText, sendMessengerText } from "@/lib/meta/client";
import { instagramSendTarget } from "@/lib/meta/page-token";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import {
  EARLY_FROM_MS,
  REMINDER_UNTIL_MS,
  runWindowReminderSweep,
  type ProspectStatus,
  type ReminderCandidate,
  type ReminderPorts,
  type ReminderSweepResult,
} from "./window-reminder";

/** Client sem tipos gerados: as colunas da 0081 ainda não estão em database.types. */
type Db = SupabaseClient;

interface ConversationRow {
  id: string;
  channel: "instagram" | "messenger";
  external_user_id: string;
  status: ProspectStatus;
  reminder_sent_for_window: string | null;
  suppliers: { opt_out_at: string | null } | { opt_out_at: string | null }[] | null;
}

interface MessageRow {
  id: string;
  direction: "in" | "out";
  body: string;
  external_id: string | null;
  created_at: string;
}

function supplierOptOut(s: ConversationRow["suppliers"]): boolean {
  const list = s === null ? [] : Array.isArray(s) ? s : [s];
  return list.some((x) => x.opt_out_at !== null);
}

function createSupabaseReminderPorts(db: Db = getSupabaseAdmin()): ReminderPorts {
  const env = serverEnv();
  return {
    async listCandidates(now) {
      const { data } = await db
        .from("prospect_conversations")
        .select("id,channel,external_user_id,status,reminder_sent_for_window,suppliers(opt_out_at)")
        .in("status", ["open", "awaiting_supplier"])
        .gte("last_inbound_at", new Date(now.getTime() - REMINDER_UNTIL_MS).toISOString())
        .lte("last_inbound_at", new Date(now.getTime() - EARLY_FROM_MS).toISOString())
        .limit(200);
      const rows = (data ?? []) as unknown as ConversationRow[];
      const out: ReminderCandidate[] = [];
      for (const row of rows) {
        const { data: msgs } = await db
          .from("prospect_messages")
          .select("id,direction,body,external_id,created_at")
          .eq("conversation_id", row.id)
          .order("created_at", { ascending: false })
          .limit(50);
        const messages = (msgs ?? []) as MessageRow[];
        const inbound = messages.find((m) => m.direction === "in") ?? null;
        const outbound = messages.find((m) => m.direction === "out") ?? null;
        const { data: quotes } = await db
          .from("prospect_quotes")
          .select("id")
          .eq("conversation_id", row.id)
          .not("price_cents", "is", null)
          .limit(1);
        out.push({
          conversationId: row.id,
          channel: row.channel,
          externalUserId: row.external_user_id,
          status: row.status,
          supplierOptedOut: supplierOptOut(row.suppliers),
          lastInbound: inbound === null ? null : { id: inbound.id, at: inbound.created_at, body: inbound.body },
          lastOutboundAt: outbound?.created_at ?? null,
          hasPrice: (quotes ?? []).length > 0,
          reminderSentForWindow: row.reminder_sent_for_window,
          introducedBefore: messages.some((m) => m.direction === "out" && /eventeia/i.test(m.body)),
        });
      }
      return out;
    },

    async claim(conversationId, windowKey, now) {
      const { data } = await db
        .from("prospect_conversations")
        .update({ reminder_sent_for_window: windowKey, reminder_sent_at: now.toISOString() })
        .eq("id", conversationId)
        .in("status", ["open", "awaiting_supplier"])
        .or(`reminder_sent_for_window.is.null,reminder_sent_for_window.neq.${windowKey}`)
        .select("id");
      return (data ?? []).length === 1;
    },

    async release(conversationId, windowKey) {
      await db
        .from("prospect_conversations")
        .update({ reminder_sent_for_window: null, reminder_sent_at: null })
        .eq("id", conversationId)
        .eq("reminder_sent_for_window", windowKey);
    },

    async send(candidate, text) {
      const result =
        candidate.channel === "messenger"
          ? await sendMessengerText({
              pageId: env.META_PAGE_ID ?? "",
              accessToken: env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN || "",
              recipientId: candidate.externalUserId,
              text,
              apiVersion: env.META_API_VERSION,
            })
          : await sendInstagramText({
              ...instagramSendTarget(env),
              recipientId: candidate.externalUserId,
              text,
              apiVersion: env.META_API_VERSION,
            });
      return result.ok ? { ok: true, messageId: result.messageId } : { ok: false, messageId: null };
    },

    async recordOutbound(conversationId, text, messageId) {
      await db.from("prospect_messages").insert({
        conversation_id: conversationId,
        direction: "out",
        body: text,
        external_id: messageId,
      });
    },
  };
}

export async function runProspectWindowReminders(now: Date = new Date()): Promise<ReminderSweepResult> {
  return runWindowReminderSweep(createSupabaseReminderPorts(), now);
}
