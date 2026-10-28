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
