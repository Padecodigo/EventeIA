/**
 * Política de canal, identidade, tom e fatos das respostas automáticas.
 * A EventeIA atende SOMENTE pelas redes sociais (Instagram e Messenger), com o
 * Instagram como canal preferido, e nunca oferece WhatsApp, telefone ou e-mail.
 */

/** Fallback fixo, usado só quando a guarda detecta oferta de outro canal. */
export const CHANNEL_POLICY_REPLY =
  "Por aqui a gente atende só pelas redes sociais, Instagram e Messenger (o Instagram é o nosso preferido, siga a @eventeia por lá). " +
  "Pode mandar aqui mesmo o valor que você cobra pelo serviço?";

export const CHANNEL_POLICY_PROMPT = [
  "Regra de canal (obrigatória): a EventeIA atende SOMENTE pelas redes sociais, Instagram e Messenger.",
  "Se o contato pedir WhatsApp, telefone, ligação, SMS, e-mail, Telegram ou outro canal, reconheça o pedido com naturalidade,",
  "explique que o atendimento é só pelas redes sociais (Instagram e Messenger), reforce com gentileza o Instagram como canal preferido",
  "(convide a seguir a @eventeia) e peça o orçamento ali mesmo, com o valor que cobra pelo serviço.",
  "NUNCA ofereça, peça para migrar nem compartilhe número de WhatsApp, telefone, e-mail ou outro contato fora das redes sociais.",
].join(" ");

/**
 * Identidade em TODA resposta automática: a EventeIA, um serviço autônomo de prospecção
 * de fornecedores. "somos a EventeIA" só na primeira resposta ou quando perguntarem
 * quem somos. Nunca diz por conta própria que é IA; não mente se perguntado.
 */
export const IDENTITY_POLICY_PROMPT = [
  "Identidade (obrigatória): fale como a própria empresa, a EventeIA, um serviço autônomo de prospecção de fornecedores para eventos,",
  "em nome da empresa, na primeira pessoa do plural (nós, a EventeIA).",
  'Use a frase "somos a EventeIA" SOMENTE na primeira resposta da conversa ou quando perguntarem quem somos; nas demais, não se reapresente.',
  "Nunca mencione nem sugira por conta própria que é uma IA, inteligência artificial, modelo de linguagem, chatbot ou assistente virtual.",
  "Exceção: se o contato perguntar de forma sincera e direta se está falando com um humano ou com um robô, não minta:",
  'nunca diga que é humano e não use "serviço autônomo" como resposta a essa pergunta;',
  "diga brevemente que é o sistema de prospecção da EventeIA (não precisa usar a palavra IA) e retome o pedido de orçamento.",
].join(" ");

/** Tom: curto, natural; perguntas fora do roteiro respondidas e redirecionadas. */
export const CONVERSATION_TONE_PROMPT = [
  "Tom no Instagram e no Messenger: respostas curtas, no máximo 2 frases (cerca de 250 caracteres), naturais, humanas e nada robóticas, em português do Brasil.",
  "Se o fornecedor fizer uma pergunta fora do roteiro, responda de forma curta e conversacional e redirecione para o orçamento, pedindo o valor que ele cobra pelo serviço.",
  "Não repita cidade, número de convidados ou categoria a cada mensagem; cite só quando for relevante ou perguntado.",
].join(" ");

/** Fatos da empresa: o modelo só afirma o que está aqui ou no contexto. */
export const COMPANY_FACTS_PROMPT = [
  "Fatos da EventeIA (use só estes; não invente outros):",
  "não há nenhum custo para o fornecedor;",
  "quem organiza o evento é quem usa a EventeIA para cotar e comparar fornecedores;",
  "nossos canais são o Instagram @eventeia e o site eventeia.com.br;",
  "sempre damos retorno ao fornecedor, mesmo quando o orçamento não for fechado;",
  "privacidade: nunca compartilhe nome, contato ou qualquer dado do cliente/organizador.",
  "Não invente detalhes do evento além do contexto informado. Se não souber algo, diga que não sabe (ou que vai confirmar com a organização).",
].join(" ");

const CONTACT_DATA: readonly RegExp[] = [
  /\bwa\.me\b|api\.whatsapp|chat\.whatsapp|t\.me\//i,
  /[\w.+-]+@[\w-]+\.[a-z]{2,}(\.[a-z]{2,})?/i,
  // números de telefone: (12) 99999-9999, +55 12 99999 9999, 12999999999
  /(\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/,
];

// Fronteira de palavra compatível com acentos (\b do JS ignora "ó", "ã"…).
const W = "(?<![\\p{L}\\p{N}_])";
const E = "(?![\\p{L}\\p{N}_])";
const word = (alternatives: string) => new RegExp(`${W}(?:${alternatives})${E}`, "iu");

const CHANNEL_MENTION = word(
  [
    "whats\\s*app",
    "whats",
    "zap",
    "zapzap",
    "wpp",
    "telegram",
    "signal",
    "sms",
    "e-?mail",
    "telefone",
    "liga[çc][ãa]o",
    "(?:meu|nosso|seu|no|pelo|por)\\s+celular",
    "(?:te|lhe|nos|me|voc[eê]|vc)\\s+(?:ligar|ligo|ligue|ligamos|liga)",
    "ligar\\s+(?:pra|para)\\s+(?:voc[eê]|vc|n[óo]s|a gente)",
  ].join("|"),
);

/** Marcadores de recusa/restrição: a frase cita o canal só para dizer que não usamos. */
const RESTRICTION = word("n[ãa]o|nunca|s[óo]|somente|apenas|exclusivamente|redes sociais");

/**
 * true quando o texto oferece/compartilha um canal fora das redes sociais.
 * Dados de contato (número, e-mail, link) sempre contam; menção a um canal
 * só conta quando a frase não é uma recusa ("atendemos só por aqui").
 */
export function offersOffChannel(text: string): boolean {
  if (CONTACT_DATA.some((pattern) => pattern.test(text))) return true;
  return text
    .split(/(?<=[.!?;\n])\s+/)
    .some((sentence) => CHANNEL_MENTION.test(sentence) && !RESTRICTION.test(sentence));
}

/** Termos proibidos em texto público ("EventeIA" é permitido). */
export const BANNED_PUBLIC_TERMS =
  /(?<![\p{L}\p{N}_])(?:IA|I\.A\.|intelig[eê]ncia artificial|assistente virtual)(?![\p{L}\p{N}_])/iu;

/** true quando o texto contém "IA" isolado, "inteligência artificial" ou "assistente virtual". */
export function containsBannedTerms(text: string): boolean {
  return BANNED_PUBLIC_TERMS.test(text);
}

const BANNED_REWRITES: readonly [RegExp, string][] = [
  [
    /(?<![\p{L}\p{N}_])(?:uma|um)\s+(?:IA|I\.A\.|intelig[eê]ncia artificial|assistente virtual)(?![\p{L}\p{N}_])/giu,
    "um serviço autônomo de prospecção de fornecedores",
  ],
  [
    /(?<![\p{L}\p{N}_])(?:a|o)\s+(?:IA|I\.A\.|intelig[eê]ncia artificial|assistente virtual)(?![\p{L}\p{N}_])/giu,
    "o serviço autônomo de prospecção de fornecedores",
  ],
  [
    /(?<![\p{L}\p{N}_])(?:IA|I\.A\.|intelig[eê]ncia artificial|assistente virtual)(?![\p{L}\p{N}_])/giu,
    "serviço autônomo de prospecção de fornecedores",
  ],
];

/** Reescreve os termos proibidos para a persona "um serviço autônomo de prospecção de fornecedores". */
export function rewriteBannedTerms(text: string): string {
  return BANNED_REWRITES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
}

/**
 * Guarda determinística: a resposta gerada só é trocada pelo fallback fixo
 * quando oferece outro canal; uma recusa natural do modelo é preservada.
 */
export function enforceSocialOnlyReply(reply: string): string {
  return offersOffChannel(reply) ? CHANNEL_POLICY_REPLY : rewriteBannedTerms(reply);
}
