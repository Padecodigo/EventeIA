import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Webhook do TikTok (OAuth/eventos). Verifica a assinatura HMAC-SHA256 do
 * header `TikTok-Signature` (`t=<ts>,s=<hex>`) com o client_secret do ambiente
 * ativo (sandbox ou produção) e responde 200 rápido (ack). Idempotência do
 * consumidor fica a cargo do processamento posterior.
 */
function verifySignature(secret: string, timestamp: string, signature: string, rawBody: string): boolean {
  if (secret.length === 0 || timestamp.length === 0 || signature.length === 0) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function withinWindow(timestamp: string, maxSeconds = 300): boolean {
  const t = Number(timestamp);
  if (!Number.isFinite(t) || t <= 0) return false;
  return Math.abs(Date.now() / 1000 - t) <= maxSeconds;
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  const header = request.headers.get("TikTok-Signature") ?? "";
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=")));
  const timestamp = parts.t ?? "";
  const signature = parts.s ?? "";

  const env = serverEnv();
  const activeSecret = env.TIKTOK_ENV === "production" ? env.TIKTOK_CLIENT_SECRET : env.TIKTOK_SANDBOX_CLIENT_SECRET;
  // Aceita o segredo do ambiente ativo (e o alternativo, caso o callback receba
  // eventos de apps diferentes apontando para a mesma URL).
  const otherSecret = env.TIKTOK_ENV === "production" ? env.TIKTOK_SANDBOX_CLIENT_SECRET : env.TIKTOK_CLIENT_SECRET;

  const ok =
    verifySignature(activeSecret ?? "", timestamp, signature, rawBody) ||
    verifySignature(otherSecret ?? "", timestamp, signature, rawBody);

  if (!ok) {
    logger.warn("webhook tiktok rejeitado (assinatura inválida)");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  if (!withinWindow(timestamp)) {
    logger.warn("webhook tiktok rejeitado (timestamp fora da janela)");
    return NextResponse.json({ error: "stale" }, { status: 401 });
  }

  // Loga apenas o tipo do evento (nunca o corpo — pode conter PII).
  try {
    const json = JSON.parse(rawBody) as { type?: string; event?: string };
    logger.info({ type: json.type ?? json.event ?? "unknown" }, "tiktok webhook recebido");
  } catch {
    logger.info("tiktok webhook recebido (corpo não-JSON)");
  }

  return NextResponse.json({ ok: true });
}
