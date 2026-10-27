import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhooks do Meta (Instagram + Messenger) — funções puras de verificação.
 *
 * A assinatura é idêntica à do WhatsApp Cloud: `X-Hub-Signature-256:
 * sha256=<hex>` = HMAC-SHA256(app secret, corpo bruto). O desafio GET de
 * verificação também usa `hub.mode`/`hub.verify_token`/`hub.challenge`.
 */

export function verifyHubSignature(
  rawBody: string,
  header: string | null,
  appSecret: string | undefined,
): boolean {
  if (header === null || appSecret === undefined || appSecret.length === 0) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (match === null) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(match[1], "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyChallenge(
  params: URLSearchParams,
  verifyToken: string | undefined,
): string | null {
  if (verifyToken === undefined || verifyToken.length === 0) return null;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || token === null || challenge === null) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return challenge;
}
