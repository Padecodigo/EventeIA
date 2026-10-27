import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyChallenge, verifyHubSignature } from "@/lib/meta/signature";
import { parseMetaWebhook } from "@/lib/meta/webhook";

export const runtime = "nodejs";

/**
 * Webhook único do Meta (Instagram + Messenger).
 *
 * Fase 2 (fundação): verifica a assinatura e normaliza as mensagens recebidas.
 * O encaminhamento para o pipeline de interpretação (DeepSeek V4 Flash) entra
 * na etapa seguinte; por ora nada é processado nem persistido.
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

/** Recebe mensagens do Instagram/Messenger, valida a assinatura e normaliza. */
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

  const messages = parseMetaWebhook(json);
  if (messages === null) {
    // echo/read/delivery ou payload não reconhecido: confirma recebimento e ignora.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  logger.info({ count: messages.length }, "webhook meta: mensagens recebidas (fundação)");

  // TODO(meta, etapa seguinte): repassar para o pipeline de entrada + responder.
  return NextResponse.json({ received: true, count: messages.length }, { status: 200 });
}
