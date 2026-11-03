import { normalizeCategoryCode, type CategoryCode } from "@/lib/catalog/v1";

import type { AgentMessage, AgentReply } from "./agent";
import type { StructuredQuote } from "./quote";

/**
 * Guardas determinísticas da resposta automática ao fornecedor (DM):
 * rótulo natural da categoria, preço já enviado vira cotação + agradecimento,
 * nunca a mesma mensagem duas vezes seguidas e reconhecimento do serviço que o
 * fornecedor diz oferecer.
 */

/** Rótulo falado (pt-BR, minúsculo) de cada categoria — nunca o código cru. */
export const CATEGORY_SPOKEN_LABELS: Record<CategoryCode, string> = {
  espaco: "local/espaço",
  buffet: "buffet",
  bebidas: "bebidas",
  bolo_doces: "bolo e doces",
  decoracao: "decoração",
  foto_video: "foto e vídeo",
  som_dj: "som/DJ",
  musica_ao_vivo: "música ao vivo",
  banda: "banda",
  cantor_cerimonia: "cantor de cerimônia",
  barman: "bar/barman",
  iluminacao: "iluminação",
  mobiliario: "mobiliário",
  garcons: "garçons e copeiras",
  louca: "louça, talheres e toalhas",
  limpeza: "limpeza",
  seguranca: "segurança e portaria",
  transporte: "transporte de convidados",
  gerador: "gerador de energia",
  cerimonial: "cerimonial/assessoria",
  recreacao: "recreação infantil",
  convites: "convites",
  lembrancinhas: "lembrancinhas e brindes",
  audiovisual: "telão, projetor e microfones",
  outros: "o serviço",
};

/** "som_dj" → "som/DJ"; código desconhecido vira texto legível (sem "_"). */
export function spokenCategoryLabel(raw: string): string {
  if ((CATEGORY_SPOKEN_LABELS as Record<string, string>)[raw] !== undefined)
    return CATEGORY_SPOKEN_LABELS[raw as CategoryCode];
  const code = normalizeCategoryCode(raw);
  if (code !== null) return CATEGORY_SPOKEN_LABELS[code];
  const text = raw.replace(/[_-]+/g, " ").trim();
  return text === "" ? "o serviço" : text;
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Palavras com que o fornecedor descreve o próprio serviço → categoria. */
const SERVICE_KEYWORDS: readonly [RegExp, CategoryCode][] = [
  [/\bbuffets?\b|\bcoquetel\b|\bcardapio\b|\bchurrasco\b/, "buffet"],
  [/\bdjs?\b|\bsonorizacao\b|\bsom\b/, "som_dj"],
  [/\bfotograf|\bfilmage|\bfoto(s)?\b/, "foto_video"],
  [/\bdecora/, "decoracao"],
  [/\bbolos?\b|\bdoces\b|\bconfeitar/, "bolo_doces"],
  [/\bbanda\b/, "banda"],
  [/\bbar(man|tender)?\b|\bdrinks?\b/, "barman"],
  [/\bgarco(n|ns)\b|\bcopeiras?\b/, "garcons"],
  [/\bilumina/, "iluminacao"],
  [/\bsalao\b|\bespaco\b|\bchacara\b/, "espaco"],
  [/\bcerimonial\b|\bassessoria\b/, "cerimonial"],
  [/\brecreac|\bmonitores\b/, "recreacao"],
];

/** Serviço que o fornecedor diz oferecer, quando difere do cadastrado. */
export function mentionedOtherService(text: string, category: string): CategoryCode | null {
  const registered = normalizeCategoryCode(category);
  const t = fold(text);
  for (const [re, code] of SERVICE_KEYWORDS) {
    if (re.test(t)) return code === registered ? null : code;
  }
  return null;
}

/** "3.500" → 350000; "3.500,50" → 350050; "3500" → 350000. */
function toCents(num: string): number | null {
  const [intPart, frac = ""] = num.split(",");
  const reais = Number((intPart ?? "").replace(/\./g, ""));
  if (!Number.isFinite(reais)) return null;
  return reais * 100 + Number(frac.padEnd(2, "0").slice(0, 2) || "0");
}

export interface DetectedPrice {
  cents: number;
  perPerson: boolean;
  volume: number | null;
  /** Trecho do valor como o fornecedor escreveu (ex.: "R$ 3.500"). */
  display: string;
}

/** Detecta um valor em reais na mensagem do fornecedor ("R$ 3.500", "3500 reais", "3,5 mil"). */
export function detectPrice(text: string): DetectedPrice | null {
  const t = fold(text);
  let cents: number | null = null;
  let display = "";
  const rs = /r\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(\s*mil\b)?/.exec(t);
  const reais = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(mil\s*)?(reais|conto)/.exec(
    t,
  );
  const m = rs ?? reais;
  if (m !== null && m[1] !== undefined) {
    cents = toCents(m[1]);
    if (cents !== null && m[2] !== undefined && /mil/.test(m[2])) cents *= 1000;
    display = text
      .slice(m.index, m.index + m[0].length)
      .replace(/\s*(reais|conto)$/i, "")
      .trim();
    if (!/^r\$/i.test(display)) display = `R$ ${display}`;
  }
  if (cents === null || cents <= 0) return null;
  const vol = /(\d+)\s*(pessoas|convidados|pax)\b/.exec(t);
  return {
    cents,
    perPerson: /\bpor (pessoa|convidado|cabeca)\b|\/\s*(pessoa|convidado)/.test(t),
    volume: vol?.[1] !== undefined ? Number(vol[1]) : null,
    display,
  };
}

export function quoteFromSupplierText(text: string, category: string): StructuredQuote | null {
  const price = detectPrice(text);
  if (price === null) return null;
  return {
    product: spokenCategoryLabel(category),
    specifications: text.trim().slice(0, 1000),
    volume: price.volume,
    moq: null,
    priceCents: price.perPerson
      ? price.volume !== null
        ? price.cents * price.volume
        : null
      : price.cents,
    unitPriceCents: price.perPerson ? price.cents : null,
    deadlineDays: null,
    shippingCents: null,
    paymentTerms: null,
    validUntil: null,
  };
}

/** Agradece e confirma o valor recebido, reconhecendo o serviço citado. */
export function priceThanksMessage(supplierText: string, category: string): string {
  const other = mentionedOtherService(supplierText, category);
  const summary = supplierText
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!]+$/, "")
    .slice(0, 160);
  const ack =
    other !== null
      ? ` Vi que vocês trabalham com ${CATEGORY_SPOKEN_LABELS[other]}, anotado também.`
      : "";
  return `Perfeito, anotei: ${summary}. Obrigado!${ack} Vou repassar ao cliente e te dou retorno por aqui.`;
}

/** Normaliza para comparar mensagens (ignora caixa, acento, pontuação e espaços). */
export function sameMessage(a: string, b: string): boolean {
  const n = (s: string) =>
    fold(s)
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return n(a) !== "" && n(a) === n(b);
}

const ASKS_PRICE = /\b(valor|preco|quanto|orcamento)\b/;

function lastOf(history: readonly AgentMessage[], role: AgentMessage["role"]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role === role) return m.content;
  }
  return null;
}

export type GuardResult = { reply: AgentReply } | { skip: string };

/**
 * Ajusta a resposta do agente antes do envio:
 * - preço já informado na última mensagem → registra a cotação e agradece
 *   (em vez de pedir o valor de novo);
 * - resposta idêntica à anterior do agente → reformula; se não der, não envia.
 * `reply` null (saída inválida do modelo) só é recuperada quando há preço.
 */
export function guardAgentReply(input: {
  reply: AgentReply | null;
  history: readonly AgentMessage[];
  category: string;
}): GuardResult | null {
  const supplierText = lastOf(input.history, "user") ?? "";
  const previous = lastOf(input.history, "assistant");
  const detected = quoteFromSupplierText(supplierText, input.category);
  let reply = input.reply;

  if (detected !== null) {
    const base: AgentReply = reply ?? {
      reply: "",
      quote: null,
      escalate: false,
      done: false,
      optOut: false,
      referrals: [],
    };
    const repeats = previous !== null && sameMessage(base.reply, previous);
    const reasks = base.quote === null && ASKS_PRICE.test(fold(base.reply));
    reply = {
      ...base,
      quote: base.quote ?? detected,
      reply:
        base.reply === "" || repeats || reasks
          ? priceThanksMessage(supplierText, input.category)
          : base.reply,
    };
  }
  if (reply === null) return null;

  if (previous !== null && sameMessage(reply.reply, previous)) {
    const label = spokenCategoryLabel(input.category);
    const alt = ASKS_PRICE.test(fold(previous))
      ? `Sem pressa! Quando puder, me passa uma ideia de valor para ${label} (pode ser uma faixa) que eu já repasso ao cliente.`
      : `Combinado! Qualquer novidade sobre ${label}, me chama por aqui.`;
    if (sameMessage(alt, previous)) return { skip: "resposta repetida — não reenviada" };
    reply = { ...reply, reply: alt };
  }
  return { reply };
}
