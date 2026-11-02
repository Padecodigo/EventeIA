/**
 * Código de confirmação do evento (`EVT-XXXXXX`): gerado no banco (0082) com CSPRNG,
 * alfabeto sem caracteres ambíguos. O contratante envia o código por DM ao @eventeia
 * para confirmar e publicar o evento. Módulo puro — sem I/O.
 *
 * Não confundir com o código PÚBLICO do post de prospecção (`EVT-` + 8, derivado do id):
 * o de confirmação tem exatamente 6 caracteres após o prefixo.
 */

export const CONFIRMATION_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const BODY_LENGTH = 6;
const CODE_RE = /(?<![A-Z0-9])EVT[-\s]?([A-Z0-9]{6})(?![A-Z0-9])/gi;

export const INSTAGRAM_DM_URL = "https://ig.me/m/eventeia";
export const CONFIRMATION_INSTRUCTIONS =
  "Envie este código por DM para @eventeia no Instagram para confirmar e publicar seu evento";

/** Normaliza para `EVT-XXXXXX` ou null quando não é um código válido. */
export function normalizeConfirmationCode(raw: string): string | null {
  const m = /^\s*EVT[-\s]?([A-Z0-9]{6})\s*$/i.exec(raw);
  if (m === null) return null;
  const body = (m[1] ?? "").toUpperCase();
  if (body.length !== BODY_LENGTH) return null;
  for (const ch of body) if (!CONFIRMATION_CODE_ALPHABET.includes(ch)) return null;
  return `EVT-${body}`;
}

/** Códigos de confirmação válidos presentes no texto (no máx. 3, sem repetição). */
export function confirmationCodesFromText(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(CODE_RE)) {
    const code = normalizeConfirmationCode(`EVT-${match[1]}`);
    if (code !== null) out.add(code);
    if (out.size >= 3) break;
  }
  return [...out];
}

/** O evento pode prospectar/publicar? Só depois do código recebido por DM. */
export function isEventConfirmed(event: { confirmedAt: string | Date | null | undefined }): boolean {
  return event.confirmedAt !== null && event.confirmedAt !== undefined;
}
