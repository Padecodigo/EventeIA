import { timingSafeEqual } from "node:crypto";

/** Comparação de tokens em tempo constante (SECURITY.md §5). */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}

/** Valida o token do webhook Asaas. Falha fechada (sem token ⇒ negado). */
export function verifyAsaasWebhookToken(received: string | null): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (received === null || expected === undefined || expected.length === 0) {
    return false;
  }
  return timingSafeEqualStrings(received, expected);
}

/** Valida o token do webhook Evolution API. Falha fechada. */
export function verifyEvolutionWebhookToken(received: string | null): boolean {
  const expected = process.env.EVOLUTION_WEBHOOK_TOKEN;
  if (received === null || expected === undefined || expected.length === 0) {
    return false;
  }
  return timingSafeEqualStrings(received, expected);
}

/**
 * Token do webhook Evolution. Preferência: header `x-evolution-token` ou
 * `Authorization: Bearer`. Fallback TEMPORÁRIO: `?token=` — o webhook GLOBAL da
 * Evolution (WEBHOOK_GLOBAL_URL) não envia headers customizados; só o webhook
 * por instância envia. Desligue com EVOLUTION_WEBHOOK_ALLOW_QUERY_TOKEN=false
 * quando migrar para webhook por instância com headers.
 */
export function readEvolutionWebhookToken(
  headers: Headers,
  url: URL,
): { token: string | null; via: "header" | "query" | null } {
  const header = headers.get("x-evolution-token");
  if (header !== null && header.length > 0) return { token: header, via: "header" };
  const auth = headers.get("authorization");
  const bearer = auth !== null && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : "";
  if (bearer.length > 0) return { token: bearer, via: "header" };
  if (process.env.EVOLUTION_WEBHOOK_ALLOW_QUERY_TOKEN === "false") return { token: null, via: null };
  const query = url.searchParams.get("token");
  return query !== null && query.length > 0 ? { token: query, via: "query" } : { token: null, via: null };
}

const SECRET_QUERY_PARAM = /([?&](?:token|apikey|api_key|access_token|secret)=)[^&#\s"']*/gi;

/** Mascara segredos em query strings (para logs). */
export function redactSecrets(value: string): string {
  return value.replace(SECRET_QUERY_PARAM, "$1[REDACTED]");
}

/** Segredo do endpoint interno de ingestão de fornecedores. Falha fechada. */
export function verifyDiscoveryIngestSecret(received: string | null): boolean {
  const expected = process.env.DISCOVERY_INGEST_SECRET;
  if (received === null || expected === undefined || expected.length < 32) {
    return false;
  }
  return timingSafeEqualStrings(received, expected);
}
