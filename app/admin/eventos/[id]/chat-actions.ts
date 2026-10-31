"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { sendChatMessage, type ChatDb } from "@/lib/outreach/chat";
import { sendChatToSupplier } from "@/lib/outreach/chat-runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface AdminEventChatSendState {
  ok?: boolean;
  error?: string;
  closed?: boolean;
  masked?: boolean;
}

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1, "Escreva uma mensagem.").max(2000, "Mensagem muito longa."),
});

/** Intervenção do agente da EventeIA na conversa mediada (visão admin). */
export async function adminSendEventChatMessageAction(
  _previous: AdminEventChatSendState,
  formData: FormData,
): Promise<AdminEventChatSendState> {
  await requireAdmin();
  const parsed = sendSchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Mensagem inválida." };
  }

  const admin = getSupabaseAdmin();
  const { data: conversation } = await admin
    .from("supplier_conversations")
    .select("id,event_id")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (conversation === null || conversation.event_id === null) {
    return { error: "Conversa não encontrada." };
  }

  try {
    const result = await sendChatMessage(
      admin as unknown as ChatDb,
      {
        eventId: conversation.event_id,
        conversationId: conversation.id,
        body: parsed.data.body,
        author: "agent",
      },
      { now: new Date(), send: sendChatToSupplier },
    );
    if (!result.ok) {
      return { error: result.error, closed: result.closed };
    }
    revalidatePath(`/admin/eventos/${conversation.event_id}`);
    revalidatePath(`/eventos/${conversation.event_id}`);
    return { ok: true, masked: result.masked };
  } catch (caught) {
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "falha ao enviar intervenção do agente no chat",
    );
    return { error: "Não foi possível enviar a mensagem agora. Tente novamente." };
  }
}
