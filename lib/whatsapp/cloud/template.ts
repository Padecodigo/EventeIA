/**
 * Template aprovado de primeiro contato (Cloud API) — puro.
 *
 * A Meta exige template aprovado para iniciar conversa. O texto continua sendo
 * gerado por `buildFirstContactText` (lib/whatsapp/first-contact.ts); aqui ele é
 * fatiado por frases em N variáveis do corpo ({{1}}…{{N}}), sem quebras de linha,
 * tabs ou 4+ espaços (regras da Meta para parâmetros).
 */
export const DEFAULT_TEMPLATE_PARAM_COUNT = 3;
const MAX_PARAM_CHARS = 1024;

function sanitizeParam(value: string): string {
  return value
    .replace(/[\t\r\n]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, MAX_PARAM_CHARS);
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter((s) => s.length > 0);
}

/** Distribui as frases, em ordem, em exatamente `count` parâmetros não vazios. */
export function firstContactTemplateParams(
  text: string,
  count = DEFAULT_TEMPLATE_PARAM_COUNT,
): string[] {
  const n = Math.max(1, Math.floor(count));
  const sentences = splitSentences(text);
  if (sentences.length === 0) throw new Error("texto de primeiro contato vazio");
  const groups: string[][] = Array.from({ length: n }, () => []);
  sentences.forEach((s, i) => {
    groups[Math.min(n - 1, Math.floor((i * n) / sentences.length))].push(s);
  });
  // Menos frases que variáveis: completa com "-" (Meta rejeita parâmetro vazio).
  return groups.map((g) => (g.length > 0 ? sanitizeParam(g.join(" ")) : "-"));
}

export interface CloudTemplatePayload {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components: { type: "body"; parameters: { type: "text"; text: string }[] }[];
  };
}

export function buildFirstContactTemplatePayload(input: {
  to: string;
  text: string;
  templateName: string;
  languageCode: string;
  paramCount?: number;
}): CloudTemplatePayload {
  return {
    messaging_product: "whatsapp",
    to: input.to.replace(/^\+/, ""),
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components: [
        {
          type: "body",
          parameters: firstContactTemplateParams(input.text, input.paramCount).map((t) => ({
            type: "text" as const,
            text: t,
          })),
        },
      ],
    },
  };
}
