/**
 * Criptografia em repouso dos tokens do TikTok (AES-256-GCM via Node crypto).
 * Chave: TIKTOK_TOKEN_ENCRYPTION_KEY (server-only). Sem a chave, os tokens são
 * gravados em claro e o chamador marca `encrypted = false` (nunca falha o app).
 */

import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Deriva uma chave de 32 bytes (AES-256) de uma string de configuração. */
export function deriveKey(raw: string | undefined | null): Buffer | null {
  if (raw === undefined || raw === null || raw.length === 0) return null;
  return createHash("sha256").update(raw).digest();
}

/** Criptografa e devolve base64(iv || authTag || ciphertext). */
export function encryptToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Descriptografa o payload de `encryptToken`. Lança se a chave/autenticação falhar. */
export function decryptToken(payload: string, key: Buffer): string {
  const data = Buffer.from(payload, "base64");
  const iv = data.subarray(0, IV_BYTES);
  const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = data.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export interface ProtectedToken {
  /** Valor a persistir (criptografado ou em claro, conforme `encrypted`). */
  value: string;
  /** true = criptografado em repouso; false = em claro (chave ausente). */
  encrypted: boolean;
}

/**
 * Protege um token para persistência. Sem chave, devolve o texto em claro com
 * `encrypted: false` (degradação explícita; o chamador loga e segue).
 */
export function protectToken(plaintext: string, rawKey: string | undefined): ProtectedToken {
  const key = deriveKey(rawKey);
  if (key === null) {
    return { value: plaintext, encrypted: false };
  }
  return { value: encryptToken(plaintext, key), encrypted: true };
}
