/**
 * Moderação das mensagens do chat mediado (fornecedor ↔ usuário).
 *
 * Regra do produto: a conversa acontece dentro da EventeIA. Telefones, e-mails,
 * links, domínios e @handles são removidos dos DOIS lados antes de gravar/relayar,
 * para que o contato não migre para fora da plataforma.
 *
 * Função pura e determinística (sem I/O): pode ser usada na ingestão do webhook
 * (mensagem do fornecedor) e no envio pelo app (mensagem do usuário/agente).
 */

export const CONTACT_PLACEHOLDER = "[contato removido]";

export interface ModerationResult {
  text: string;
  /** True quando algum contato foi removido (a mensagem gravada é a versão moderada). */
  masked: boolean;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu;
const URL_WITH_SCHEME = /(?:\bhttps?:\/\/|\bwww\.)[^\s<>"']+/giu;
const BARE_DOMAIN =
  /\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|br|io|me|app|link|shop|site|dev|xyz)(?:\.[a-z]{2})?(?:\/[^\s<>"']*)?/giu;
const HANDLE = /(?<![\p{L}\p{N}_.])@[\p{L}\p{N}_.]{2,30}/giu;
const PHONE_INTERNATIONAL = /\+\d{1,3}[\s.-]?(?:\(\d{2,3}\)|\d{2,3})[\s.-]?\d{4,5}[\s.-]?\d{4}/g;
const PHONE_BR =
  /\b(?:\(?\d{2}\)?[\s.-]?)(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}\b/g;
const PHONE_LOCAL = /\b(?:9[\s.-]?)?\d{4}[\s.-]\d{4}\b/g;
const PHONE_RAW = /\b\d{10,11}\b/g;

const PHONE_PATTERNS = [PHONE_INTERNATIONAL, PHONE_BR, PHONE_LOCAL, PHONE_RAW];
const REPEATED_PLACEHOLDERS = new RegExp(
  `(?:${CONTACT_PLACEHOLDER.replace(/[[\]]/g, "\\$&")}\\s*){2,}`,
  "g",
);

function replaceMasked(text: string, pattern: RegExp): { text: string; changed: boolean } {
  let changed = false;
  const next = text.replace(pattern, () => {
    changed = true;
    return CONTACT_PLACEHOLDER;
  });
  return { text: next, changed };
}

/** Remove contatos (e-mail, link, domínio, @handle, telefone) de um texto. */
export function moderateContactInfo(raw: string): ModerationResult {
  let text = raw.replace(/\u0000/g, "").trim();
  let masked = false;

  for (const pattern of [EMAIL, URL_WITH_SCHEME, BARE_DOMAIN, HANDLE, ...PHONE_PATTERNS]) {
    const result = replaceMasked(text, pattern);
    text = result.text;
    masked = masked || result.changed;
  }

  text = text.replace(REPEATED_PLACEHOLDERS, CONTACT_PLACEHOLDER).trim();
  return { text, masked };
}
