"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { sendChatMessage, type ChatDb } from "@/lib/outreach/chat";
import { sendChatToSupplier } from "@/lib/outreach/chat-runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface EventChatSendState {
  ok?: boolean;
  error?: string;
  closed?: boolean;
  masked?: boolean;
}

const sendSchema = z.object({
  eventId: z.string().uuid(),
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1, "Escreva uma mensagem.").max(2000, "Mensagem muito longa."),
});

/** Usuário envia pelo chat do evento; o relay só sai dentro da janela e sem contatos. */
export async function sendEventChatMessageAction(
  _previous: EventChatSendState,
  formData: FormData,
): Promise<EventChatSendState> {
  await requireUser();
  const parsed = sendSchema.safeParse({
    eventId: formData.get("eventId"),
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Mensagem inválida." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,status")
    .eq("id", parsed.data.eventId)
    .maybeSingle();
  if (event === null) {
    return { error: "Evento não encontrado." };
  }
  if (event.status === "canceled") {
    return { error: "Este evento foi excluído." };
  }

  try {
    const result = await sendChatMessage(
      getSupabaseAdmin() as unknown as ChatDb,
      {
        eventId: event.id,
        conversationId: parsed.data.conversationId,
        body: parsed.data.body,
        author: "user",
      },
      { now: new Date(), send: sendChatToSupplier },
    );
    if (!result.ok) {
      return { error: result.error, closed: result.closed };
    }
    revalidatePath(`/eventos/${event.id}`);
    return { ok: true, masked: result.masked };
  } catch (caught) {
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "falha ao enviar mensagem do chat do evento",
    );
    return { error: "Não foi possível enviar a mensagem agora. Tente novamente." };
  }
}
