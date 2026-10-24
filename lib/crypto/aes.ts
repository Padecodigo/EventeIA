import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Criptografia de credenciais de sessão (Regra 5 do Agente Orçamentista):
 * AES-256-GCM no banco, chave no servidor (env), IV aleatório por registro.
 *
 * Formato do payload: base64(iv[12] | authTag[16] | ciphertext)
 * A chave É O SEGREDO: WHATSAPP_CREDENTIALS_KEY (hex 64 chars = 32 bytes).
 */

const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/** Deriva a chave AES-256 a partir do hex do env (aceita 32 ou 64 hex chars). */
function deriveKey(secret: string): Buffer {
  const trimmed = secret.trim();
  if (trimmed.length === 64) {
    return Buffer.from(trimmed, "hex");
  }
  if (trimmed.length === 32) {
    return Buffer.from(trimmed, "utf8");
  }
  // Fallback determinístico: qualquer segredo vira chave de 32 bytes.
  return createHash("sha256").update(trimmed).digest();
}

/** Criptografa JSON (token/sessão da instância) → base64(iv|tag|ciphertext). */
export function encryptJson(value: unknown, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/** Descriptografa o payload → objeto JSON. Lança se adulterado (GCM). */
export function decryptJson<T = unknown>(payload: string, secret: string): T {
  const key = deriveKey(secret);
  const raw = Buffer.from(payload, "base64");

  const iv = raw.subarray(0, IV_BYTES);
  const authTag = raw.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(plaintext.toString("utf8")) as T;
}

/** Chave presente? (vazio = modo local sem credenciais a proteger). */
export function hasCredentialsKey(secret: string | undefined): secret is string {
  return secret !== undefined && secret.trim().length > 0;
}
