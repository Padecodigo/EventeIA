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

import { CATEGORY_LABELS, type CategoryCode } from "@/lib/catalog/v1";

function isCategoryCode(value: string): value is CategoryCode {
  return Object.hasOwn(CATEGORY_LABELS, value);
}

export type Greeting = "Bom dia" | "Boa tarde" | "Boa noite";

/** Hora (0–23) em America/Sao_Paulo. */
function saoPauloHour(now: Date): number {
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
/** Pontos específicos por categoria do catálogo (o que perguntar além do básico). */
export const CATEGORY_ASKS: Record<CategoryCode, string> = {
  espaco: "a capacidade do espaço, os horários disponíveis e o que está incluso na locação",
  buffet: "o cardápio, o valor por pessoa e a equipe que acompanha o serviço",
  bebidas: "as opções de bebidas, o cálculo por pessoa e se inclui gelo, freezer e equipe",
  bolo_doces: "os sabores, o tamanho do bolo, a quantidade de doces e a entrega",
  decoracao: "as opções de tema, os itens inclusos e como funcionam a montagem e a desmontagem",
  foto_video:
    "a cobertura em horas, a quantidade de fotos, o formato de entrega e o prazo de edição",
  som_dj: "o repertório, a duração da apresentação e o equipamento de som incluso",
  musica_ao_vivo: "o repertório, a formação, a duração da apresentação e o equipamento de som",
  iluminacao: "os tipos de iluminação, a montagem e a necessidade de energia no local",
  mobiliario: "as quantidades e os modelos de mesas e cadeiras, além da entrega e do recolhimento",
  garcons: "o número de profissionais, a carga horária e o uniforme",
  louca: "as quantidades, os modelos disponíveis, a entrega, o recolhimento e a lavagem",
  limpeza: "o tamanho da equipe, os horários antes e depois da festa e os produtos inclusos",
  seguranca: "o número de seguranças ou porteiros, a carga horária e o controle de acesso",
  transporte: "os tipos de veículo, a capacidade, os trajetos e os horários",
  gerador: "a potência, o tempo de uso, a instalação e o combustível",
  cerimonial: "o que está incluso na assessoria, o tamanho da equipe e o acompanhamento no dia",
  recreacao: "as atividades, o número de monitores, a faixa etária atendida e os brinquedos",
  convites: "os modelos, as quantidades, a personalização e o prazo de produção",
  lembrancinhas: "as opções, a personalização, as quantidades mínimas e o prazo de produção",
  audiovisual: "o telão ou projetor, os microfones, a montagem e o suporte técnico no evento",
  outros: "como você atenderia esse pedido e o que está incluso",
};
/**
 * Checklist de escopo por categoria: o que pode ou não estar incluso no preço
 * (mão de obra, louça, lavagem, mesas, limpeza, transporte, entrega/recolhimento…).
 */
export const CATEGORY_SCOPE: Record<CategoryCode, string> = {
  espaco: "mesas e cadeiras, limpeza, segurança, cozinha e estacionamento",
  buffet:
    "só a comida ou também a mão de obra, louça e talheres (ou se precisa alugar), lavagem da louça e transporte",
  bebidas: "gelo, freezer ou chopeira, copos, bartender e entrega",
  bolo_doces: "entrega, montagem da mesa, forminhas e suportes",
  decoracao: "montagem, desmontagem, flores, mobiliário decorativo e frete",
  foto_video: "álbum impresso, edição, horas extras e deslocamento",
  som_dj: "som, iluminação de pista, montagem e deslocamento",
  musica_ao_vivo: "equipamento de som, técnico, horas extras e deslocamento",
  iluminacao: "montagem, desmontagem, operador e gerador",
  mobiliario: "entrega, recolhimento, montagem e toalhas",
  garcons: "uniforme, transporte da equipe, alimentação da equipe e hora extra",
  louca: "entrega, recolhimento, lavagem e reposição de peças quebradas",
  limpeza: "produtos e materiais, limpeza antes e depois e retirada do lixo",
  seguranca: "uniforme, rádios, controle de lista e hora extra",
  transporte: "motorista, combustível, pedágio e tempo de espera",
  gerador: "transporte, instalação, combustível e operador",
  cerimonial: "equipe no dia, roteiro, contato com fornecedores e ensaio",
  recreacao: "materiais, brinquedos, monitores extras e deslocamento",
  convites: "envelopes, impressão, personalização e entrega",
  lembrancinhas: "embalagem, personalização e entrega",
  audiovisual: "montagem, técnico operador, cabos e transporte",
  outros: "mão de obra, materiais, entrega e retirada",
};
const GENERIC_SCOPE = "mão de obra, materiais, entrega e retirada";

export function categoryScope(category: string | undefined): string {
  return category !== undefined && isCategoryCode(category)
    ? CATEGORY_SCOPE[category]
    : GENERIC_SCOPE;
}

const SCOPE_LEADS = [
  "Me diga também o que está incluso e o que não está, por exemplo:",
  "Também preciso saber o que está incluso e o que fica à parte, como:",
];

const GENERIC_ASK = "o que está incluso e como é feita a entrega ou a execução";

export function categoryAsk(category: string | undefined): string {
  return category !== undefined && isCategoryCode(category) ? CATEGORY_ASKS[category] : GENERIC_ASK;
}

const ASKS = [
  "Poderia me contar o que você fornece, como fornece, como funciona o serviço, {X}, valores e prazos, de forma detalhada, por favor?",
  "Você poderia me explicar o que você fornece, como é feito o fornecimento, como funciona o serviço, {X}, valores e prazos, bem detalhado, por favor?",
  "Poderia me passar o que você fornece, de que forma fornece, como funciona o serviço, {X}, valores e prazos, com detalhes, por favor?",
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
  /** Código da categoria (perguntas específicas); desconhecida → genérico. */
  category?: string;
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
    pick(ASKS, seed, 3).replace("{X}", categoryAsk(input.category)),
    `${pick(SCOPE_LEADS, seed, 4)} ${categoryScope(input.category)}.`,
    SURVEY_SENTENCE,
  ].join(" ");
}
