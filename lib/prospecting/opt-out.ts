/**
 * Opt-out — o fornecedor pede para parar. Correspondência EXATA (palavra
 * normalizada), para não confundir "quero cancelar o pedido" com saída da lista.
 */

const OPT_OUT_WORDS = new Set([
  "parar",
  "sair",
  "cancelar",
  "descadastrar",
  "remover",
  "stop",
  "unsubscribe",
]);

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isOptOut(text: string): boolean {
  const normalized = normalizeText(text).replace(/[.!?]+$/, "").trim();
  return OPT_OUT_WORDS.has(normalized);
}

/** Detecção mais ampla (substring) usada na contingência do agente. */
const OPT_OUT_PHRASES = [
  "parar", "sair", "cancelar", "descadastrar", "remover", "stop", "unsubscribe",
  "nao tenho interesse", "não tenho interesse", "nao quero mais", "não quero mais",
];

export function detectOptOut(text: string): boolean {
  const normalized = normalizeText(text);
  return OPT_OUT_PHRASES.some((phrase) => normalized.includes(phrase));
}
