/**
 * Texto do primeiro contato com fornecedores (WhatsApp).
 * Estrutura fixa (pedido do produto):
 *   1. Saudação pelo horário de São Paulo + ", tudo bem? Aqui é da EventeIA."
 *   2. Pedido de orçamento da categoria/itens.
 *   3. Descrição breve do evento (tipo, data, cidade, convidados, detalhes).
 *   4. Pergunta detalhada: o que fornece, como fornece, como funciona, valores e prazos.
 *   5. "Estamos fazendo um levantamento de orçamentos."
 * Variações de sinônimos (anti-ban) escolhidas por seed determinística.
 */

export type Greeting = "Bom dia" | "Boa tarde" | "Boa noite";

/** Hora (0–23) em America/Sao_Paulo. */
export function saoPauloHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return Number(h) % 24;
}

/** 05h–11h59 Bom dia · 12h–17h59 Boa tarde · 18h–04h59 Boa noite (horário de SP). */
export function greetingFor(now: Date): Greeting {
  const h = saoPauloHour(now);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

const QUOTE_OPENERS = [
  "Gostaria de um orçamento de",
  "Queria um orçamento de",
  "Gostaria de solicitar um orçamento de",
];
const ORGANIZING = ["Estamos organizando", "Estamos preparando", "Estamos planejando"];
const ASKS = [
  "Poderia me contar o que você fornece, como fornece, como funciona o serviço, valores e prazos, de forma detalhada, por favor?",
  "Você poderia me explicar o que você fornece, como é feito o fornecimento, como funciona o serviço, valores e prazos, bem detalhado, por favor?",
  "Poderia me passar o que você fornece, de que forma fornece, como funciona o serviço, valores e prazos, com detalhes, por favor?",
];
export const SURVEY_SENTENCE = "Estamos fazendo um levantamento de orçamentos.";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function pick<T>(arr: readonly T[], seed: number, salt: number): T {
  return arr[(seed + salt * 7919) % arr.length];
}

function article(label: string): "um" | "uma" {
  const first = (label.trim().split(/\s+/)[0] ?? "").toLowerCase();
  return /(a|ção|cao|gem|dade)$/.test(first) ? "uma" : "um";
}

export interface FirstContactTextInput {
  now: Date;
  /** Ex.: "buffet" ou "buffet: buffet completo (120 pessoas)". */
  quoteSubject: string;
  eventTypeLabel: string;
  eventDateIso: string;
  city: string;
  guestCount: number;
  /** Detalhes relevantes curtos (sem URLs). */
  details?: string;
  /** Seed de variação (ex.: nome do fornecedor). */
  seed: string;
}

export function buildFirstContactText(input: FirstContactTextInput): string {
  const seed = hash(input.seed);
  const date = new Date(`${input.eventDateIso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
  });
  const type = input.eventTypeLabel.trim().toLowerCase() || "evento";
  const where = input.city.trim().length > 0 ? ` em ${input.city.trim()}` : "";
  const details =
    input.details !== undefined && input.details.trim().length > 0
      ? ` ${input.details
          .replace(/(https?:\/\/|www\.)\S*/gi, "")
          .trim()
          .slice(0, 200)
          .replace(/\.?$/, ".")}`
      : "";
  return [
    `${greetingFor(input.now)}, tudo bem? Aqui é da EventeIA.`,
    `${pick(QUOTE_OPENERS, seed, 1)} ${input.quoteSubject.trim()}.`,
    `${pick(ORGANIZING, seed, 2)} ${article(type)} ${type} para ${String(input.guestCount)} convidados${where} no dia ${date}.${details}`,
    pick(ASKS, seed, 3),
    SURVEY_SENTENCE,
  ].join(" ");
}
