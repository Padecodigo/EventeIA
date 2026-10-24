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
