/**
 * Schemas Zod do fluxo WhatsApp (Agente Orçamentista + mensagens ao cliente).
 * Fonte da verdade: .context/WHATSAPP_EVOLUTION.md § "Agente Orçamentista".
 */

import { z } from "zod";

import { buildFirstContactText } from "@/lib/whatsapp/first-contact";

/* ============================================================
 * Regra 2 — Primeiro contato: APENAS texto puro.
 * Proibido: URLs, emojis, anexos. Comprimento humano.
 * ============================================================ */

const URL_PATTERN = /(https?:\/\/|www\.)/i;
const EMOJI_PATTERN = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/u;
const EXCLAMATION_PATTERN = /!!!/;

export const firstContactMessageSchema = z
  .string()
  .trim()
  .min(20, "mensagem muito curta")
  .max(900, "mensagem muito longa")
  .refine((text) => !URL_PATTERN.test(text), {
    message: "primeiro contato não pode conter URLs",
  })
  .refine((text) => !EMOJI_PATTERN.test(text), {
    message: "primeiro contato não pode conter emojis",
  })
  .refine((text) => !EXCLAMATION_PATTERN.test(text), {
    message: "evite pontuação excessiva",
  });

export type FirstContactMessage = z.infer<typeof firstContactMessageSchema>;

/**
 * Payload de envio do primeiro contato: SOMENTE número + texto.
 * `.strict()` rejeita qualquer campo extra (media, url, attachment, buttons…).
 */
export const firstContactPayloadSchema = z
  .object({
    number: z.string().regex(/^\+\d{10,15}$/),
    text: firstContactMessageSchema,
  })
  .strict();

export type FirstContactPayload = z.infer<typeof firstContactPayloadSchema>;

/* ============================================================
 * Payload do job de prospecção (fila quotation-prospecting-queue).
 * ============================================================ */

export const prospectingJobSchema = z.object({
  prospectId: z.string().uuid(),
  eventId: z.string().uuid(),
  instance: z.string().min(3).max(64),
  phoneE164: z.string().regex(/^\+\d{10,15}$/),
  vendorName: z.string().trim().min(2).max(80),
  eventTitle: z.string().trim().min(2).max(120),
  eventType: z.string().trim().min(2).max(40),
  eventDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  city: z.string().trim().max(60),
  guestCount: z.number().int().min(1).max(5000),
  // Descoberta automática (Fase 2) — opcionais para manter jobs antigos válidos.
  category: z.string().trim().max(40).optional(),
  messageText: firstContactMessageSchema.optional(),
  dryRun: z.boolean().optional(),
  supplierId: z.string().uuid().optional(),
});

export type ProspectingJob = z.infer<typeof prospectingJobSchema>;

/* ============================================================
 * Respostas da Evolution API.
 * ============================================================ */

export const evolutionSendResponseSchema = z.object({
  key: z
    .object({
      id: z.string().optional(),
    })
    .optional(),
  status: z.string().optional(),
});

export type EvolutionSendResponse = z.infer<typeof evolutionSendResponseSchema>;

/** GET /instance/connectionState/{instance} */
export const evolutionConnectionStateSchema = z.object({
  instance: z.string().optional(),
  state: z.enum(["open", "connecting", "close", "closed"]),
});

export type EvolutionConnectionState = z.infer<typeof evolutionConnectionStateSchema>;

/* ============================================================
 * Regra 3 — Opt-out imediato do fornecedor.
 * "não" conta como recusa apenas como mensagem inteira;
 * frases casam por PALAVRAS inteiras (acentos/case ignorados) — "parece" não é "pare".
 * ============================================================ */

const OPT_OUT_PHRASES = [
  "nao tenho interesse",
  "nao temos interesse",
  "sem interesse",
  "nao quero receber",
  "nao quero mais",
  "nao desejo receber",
  "nao me mande",
  "nao mande mais",
  "nao envie mais",
  "remover meu numero",
  "descadastrar",
  "descadastre",
  "unsubscribe",
  "pare de",
  "parar de",
  "sair da lista",
  "me tire da lista",
] as const;

/** Comandos de uma palavra: só valem em mensagens curtas ("SAIR", "parar, por favor"). */
const OPT_OUT_COMMANDS = ["parar", "pare", "sair", "stop"] as const;
const SHORT_MESSAGE_MAX_TOKENS = 5;

/** Recusas válidas apenas como mensagem inteira (ambíguas dentro de frases). */
const OPT_OUT_EXACT = new Set(["nao", "n", "no", "cancelar", "remover", "chega"]);

/** Casa a frase como sequência de PALAVRAS inteiras (evita "parece" ⇒ "pare"). */
function containsPhrase(tokens: readonly string[], phrase: string): boolean {
  const target = phrase.split(" ");
  for (let i = 0; i + target.length <= tokens.length; i += 1) {
    if (target.every((word, offset) => tokens[i + offset] === word)) {
      return true;
    }
  }
  return false;
}

/** Normaliza: minúsculas, sem acentos, espaços colapsados. */
export function normalizeReplyText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Detecta recusa/opt-out na resposta do fornecedor. */
export function detectOptOut(text: string): boolean {
  const normalized = normalizeReplyText(text);

  if (OPT_OUT_EXACT.has(normalized)) {
    return true;
  }

  const tokens = normalized.split(" ");
  if (OPT_OUT_PHRASES.some((phrase) => containsPhrase(tokens, phrase))) {
    return true;
  }
  return (
    tokens.length <= SHORT_MESSAGE_MAX_TOKENS &&
    OPT_OUT_COMMANDS.some((command) => tokens.includes(command))
  );
}

/** Monta a mensagem de primeiro contato (Regra 2: texto puro, sem URLs/emojis). */
export function renderFirstContact(input: {
  vendorName: string;
  eventTitle: string;
  eventType: string;
  eventDateIso: string;
  city: string;
  guestCount: number;
  category?: string;
  now?: Date;
}): FirstContactMessage {
  const text = buildFirstContactText({
    now: input.now ?? new Date(),
    quoteSubject:
      input.category !== undefined && input.category.length > 0
        ? input.category.replace(/_/g, " ")
        : "fornecedor para o evento",
    eventTypeLabel: input.eventType.replace(/_/g, " "),
    eventDateIso: input.eventDateIso,
    city: input.city,
    guestCount: input.guestCount,
    details: `O evento se chama "${input.eventTitle}".`,
    seed: input.vendorName,
  });
  return firstContactMessageSchema.parse(text);
}
