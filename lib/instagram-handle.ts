/**
 * Validação/normalização de handles do Instagram (@username).
 * Regras oficiais: 1–30 caracteres, letras (a-z), números, ponto e underscore;
 * sem espaço, sem ponto no início/fim e sem pontos consecutivos.
 */

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

/**
 * Normaliza um handle digitado (com ou sem "@") para a forma canônica em
 * minúsculas, sem arroba. Retorna null quando inválido.
 */
export function normalizeInstagramHandle(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const handle = (trimmed.startsWith("@") ? trimmed.slice(1) : trimmed).trim().toLowerCase();

  if (!HANDLE_RE.test(handle)) return null;
  if (handle.startsWith(".") || handle.endsWith(".")) return null;
  if (handle.includes("..")) return null;

  return handle;
}

/** Verdadeiro quando o handle (com ou sem "@") é válido. */
export function isValidInstagramHandle(input: string): boolean {
  return normalizeInstagramHandle(input) !== null;
}
