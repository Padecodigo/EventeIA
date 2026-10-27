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
