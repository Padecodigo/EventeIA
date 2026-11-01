/**
 * Itens livres da pergunta "observações / itens adicionais" (demanda_especifica).
 * Puro: separa por vírgula, normaliza, descarta lixo e tentativas de instrução
 * (prompt injection) e limita quantidade/tamanho. Cada item vira um requisito
 * próprio `livre_<slug>` (o CHECK da 0078 aceita só [a-z_]{2,40}).
 */

export const MAX_FREE_ITEMS = 10;
export const MAX_FREE_ITEM_LENGTH = 80;
export const FREE_ITEM_PREFIX = "livre_";

export const FREE_ITEMS_PLACEHOLDER =
  "Separe cada item por vírgula. Exemplo: brinquedos infláveis, pista de dança ao ar livre, mágico para crianças. Serve pra qualquer coisa que as opções não cubram, e a gente procura tudo que você escrever.";

export interface FreeItem {
  /** Código estável do requisito: livre_<slug>. */
  code: string;
  /** Texto limpo, como o cliente escreveu (para perguntar ao fornecedor). */
  label: string;
}

/** Padrões típicos de instrução ao modelo: o item é descartado inteiro. */
const INJECTION_RE =
  /\b(ignore|ignora|desconsidere|esque[cç]a|system|sistema:|prompt|instru[cç][oõã]|assistant|assistente:|role|jailbreak|developer|admin|responda (apenas|somente)|you are|voc[eê] (agora )?[eé] um)\b|<\/?[a-z]|```|\{|\}|\[|\]/i;

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40 - FREE_ITEM_PREFIX.length)
    .replace(/_+$/g, "");
}

/** Limpa um item: sem URLs, e-mails, telefones, controle ou pontuação exótica. */
export function cleanFreeItem(raw: string): string | null {
  const text = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, " ")
    .replace(/(https?:\/\/|www\.)\S*/gi, " ")
    .replace(/\S+@\S+/g, " ")
    .replace(/\+?\(?\d[\d\s().-]{7,}\d/g, " ")
    .replace(/[^\p{L}\p{N}\s/&().'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(e|and)\s+/i, "")
    .replace(/[\s.'(/&-]+$/g, "")
    .replace(/^[\s.')/&-]+/g, "");
  if (text.length < 2 || !/\p{L}{2}/u.test(text)) return null;
  if (INJECTION_RE.test(raw)) return null;
  return text.slice(0, MAX_FREE_ITEM_LENGTH).trim();
}

/** Separa por vírgula (e ; / quebras de linha), normaliza, deduplica e limita. */
export function splitFreeItems(text: string | null | undefined): FreeItem[] {
  if (typeof text !== "string") return [];
  const out: FreeItem[] = [];
  const seen = new Set<string>();
  for (const part of text.slice(0, 2_000).split(/[,;\n]+/)) {
    if (out.length >= MAX_FREE_ITEMS) break;
    const label = cleanFreeItem(part);
    if (label === null) continue;
    const s = slug(label);
    if (s.length < 2 || seen.has(s)) continue;
    seen.add(s);
    out.push({ code: `${FREE_ITEM_PREFIX}${s}`, label });
  }
  return out;
}

export function isFreeItemCode(code: string): boolean {
  return code.startsWith(FREE_ITEM_PREFIX) && /^[a-z_]{2,40}$/.test(code);
}
