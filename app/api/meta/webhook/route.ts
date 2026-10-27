import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  resolveInstagramSupplier,
  resolveInstagramSupplierByHandle,
  type MetaSupplier,
  type MetaSupplierLookup,
} from "@/lib/meta/resolve";
import { verifyChallenge, verifyHubSignature } from "@/lib/meta/signature";
import { parseMetaComments, parseMetaWebhook } from "@/lib/meta/webhook";
import { handleInbound } from "@/lib/prospecting/inbound";
import { createSupabaseProspectStore } from "@/lib/prospecting/supabase-store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * Webhook único do Meta (Instagram + Messenger).
 *
 * Verifica a assinatura, normaliza DMs e comentários, resolve o fornecedor e
 * persiste em `webhook_events` (dedup por source + external_event_id). A DM
 * resolvida também entra na conversa (`prospect_conversations`/`messages`) de
 * forma idempotente. A interpretação do texto entra na etapa seguinte.
 */

/** Verificação do webhook pela Meta (hub.challenge). */
export function GET(request: Request): NextResponse {
  const challenge = verifyChallenge(
    new URL(request.url).searchParams,
    serverEnv().META_VERIFY_TOKEN,
  );
  if (challenge === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/** Recebe eventos do Instagram/Messenger, valida, resolve o fornecedor e persiste. */
export async function POST(request: Request): Promise<NextResponse> {
  const raw = await request.text();
  if (!verifyHubSignature(raw, request.headers.get("x-hub-signature-256"), serverEnv().META_APP_SECRET)) {
    logger.warn("webhook meta rejeitado (assinatura)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const store = createSupabaseProspectStore();
  const accessToken = serverEnv().META_ACCESS_TOKEN;
  const keyword = serverEnv().META_PROSPECT_KEYWORD;
  const lookup = admin as unknown as MetaSupplierLookup;
  let persisted = 0;
  let resolved = 0;

  const persist = async (externalId: string, payload: unknown): Promise<boolean> => {
    const { data: inserted, error } = await admin
      .from("webhook_events")
      .upsert(
        {
          // A migração 0052 relaxa o CHECK para incluir 'meta'; os tipos gerados
          // (`supabase gen types`) ainda não foram regenerados, então o cast é
          // temporário até o banco receber a 0052 e os tipos serem re-gerados.
          source: "meta" as unknown as "whatsapp_cloud",
          external_event_id: externalId,
          payload: payload as Json,
          status: "received",
        },
        { onConflict: "source,external_event_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (error !== null) {
      logger.error({ code: error.code }, "falha ao persistir webhook meta");
      return false;
    }
    if (inserted !== null) persisted += 1;
    return true;
  };

  // DMs (Instagram + Messenger).
  const messages = parseMetaWebhook(json);
  for (const message of messages ?? []) {
    let supplier: MetaSupplier = null;
    if (message.source === "instagram" && accessToken !== undefined && accessToken.length > 0) {
      supplier = await resolveInstagramSupplier(lookup, message.senderId, accessToken);
      if (supplier !== null) {
        resolved += 1;
        await handleInbound(
          store,
          {
            kind: "message",
            messageId: message.eventId,
            senderId: message.senderId,
            text: message.text,
            supplierId: supplier.id,
            channel: "instagram",
          },
          { keyword, now: new Date() },
        );
      }
    }
    const payload = supplier === null ? message : { ...message, supplier };
    if (!(await persist(message.eventId, payload))) {
      return NextResponse.json({ error: "persist_failed" }, { status: 500 });
    }
  }

  // Comentários em posts de isca (o @username já vem no payload).
  const comments = parseMetaComments(json);
  for (const comment of comments ?? []) {
    const supplier = await resolveInstagramSupplierByHandle(lookup, comment.senderUsername);
    if (supplier !== null) {
      resolved += 1;
      await handleInbound(
        store,
        {
          kind: "comment",
          commentId: comment.commentId,
          senderId: comment.senderId,
          text: comment.text,
          supplierId: supplier.id,
          channel: "instagram",
        },
        { keyword, now: new Date() },
      );
    }
    const payload = supplier === null ? comment : { ...comment, supplier };
    if (!(await persist(comment.commentId, payload))) {
      return NextResponse.json({ error: "persist_failed" }, { status: 500 });
    }
  }

  if (messages === null && comments === null) {
    // echo/read/delivery ou payload não reconhecido: confirma e ignora.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  logger.info(
    { messages: messages?.length ?? 0, comments: comments?.length ?? 0, persisted, resolved },
    "webhook meta: eventos processados",
  );
  return NextResponse.json(
    { received: true, messages: messages?.length ?? 0, comments: comments?.length ?? 0 },
    { status: 200 },
  );
}
