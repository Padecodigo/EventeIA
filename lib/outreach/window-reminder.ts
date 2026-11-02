import { isWithinBusinessWindow, OUTREACH_WINDOW } from "@/lib/business-days";

/**
 * Lembrete da janela de 24h (Instagram/Messenger) nas conversas de prospecção.
 *
 * Quando a última mensagem RECEBIDA do fornecedor está perto de 24h, nossa última
 * mensagem ficou sem resposta e ainda não há preço, sai UM lembrete curto pedindo
 * o valor. Só a resposta do fornecedor reabre a janela (nosso envio não reabre).
 *
 * WhatsApp/Evolution: fora de escopo — essas conversas não vivem neste modelo
 * (`prospect_conversations.channel` ∈ instagram|messenger) e a política do
 * WhatsApp Business proíbe abordagem sem opt-in.
 *
 * Funções puras: "agora" entra por parâmetro.
 */

const HOUR_MS = 60 * 60 * 1000;
/** Faixa ideal: entre 20h e 23h30 após a última mensagem recebida. */
const REMINDER_FROM_MS = 20 * HOUR_MS;
export const REMINDER_UNTIL_MS = 23.5 * HOUR_MS;
/** Antecipação mínima quando a faixa ideal cai fora do horário comercial. */
export const EARLY_FROM_MS = 12 * HOUR_MS;
/** Intervalo do job repetível (deve casar com o agendamento no worker). */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

export type ProspectStatus =
  | "open"
  | "awaiting_supplier"
  | "awaiting_human"
  | "quoted"
  | "closed"
  | "opted_out";

export interface ReminderCandidate {
  conversationId: string;
  channel: "instagram" | "messenger" | "whatsapp";
  externalUserId: string;
  status: ProspectStatus;
  supplierOptedOut: boolean;
  lastInbound: { id: string; at: string; body: string } | null;
  lastOutboundAt: string | null;
  hasPrice: boolean;
  reminderSentForWindow: string | null;
  introducedBefore: boolean;
}

export type SkipReason =
  | "unsupported_channel"
  | "opted_out"
  | "closed"
  | "no_inbound"
  | "supplier_replied"
  | "quote_received"
  | "already_sent"
  | "window_closed"
  | "too_early"
  | "outside_business_hours";

export type ReminderDecision = { send: true; windowKey: string } | { send: false; reason: SkipReason };

const CLOSED_STATES: ReadonlySet<ProspectStatus> = new Set(["quoted", "closed", "awaiting_human"]);

function inBusiness(at: Date): boolean {
  return isWithinBusinessWindow(at, OUTREACH_WINDOW);
}

/** Existe algum instante em horário comercial em [from, to] (amostra por sweep)? */
function hasBusinessSlot(from: Date, to: Date): boolean {
  for (let t = from.getTime(); t <= to.getTime(); t += SWEEP_INTERVAL_MS) {
    if (inBusiness(new Date(t))) return true;
  }
  return false;
}

export function decideReminder(c: ReminderCandidate, now: Date): ReminderDecision {
  if (c.channel !== "instagram" && c.channel !== "messenger") {
    return { send: false, reason: "unsupported_channel" };
  }
  if (c.status === "opted_out" || c.supplierOptedOut) return { send: false, reason: "opted_out" };
  if (c.lastInbound !== null && isOptOutLike(c.lastInbound.body)) return { send: false, reason: "opted_out" };
  if (CLOSED_STATES.has(c.status)) return { send: false, reason: "closed" };
  if (c.lastInbound === null) return { send: false, reason: "no_inbound" };
  if (c.hasPrice) return { send: false, reason: "quote_received" };

  const inboundAt = new Date(c.lastInbound.at).getTime();
  const lastOut = c.lastOutboundAt === null ? NaN : new Date(c.lastOutboundAt).getTime();
  // Precisa de mensagem nossa DEPOIS da última do fornecedor (sem resposta).
  if (Number.isNaN(lastOut) || lastOut <= inboundAt) return { send: false, reason: "supplier_replied" };

  const windowKey = c.lastInbound.id;
  if (c.reminderSentForWindow === windowKey) return { send: false, reason: "already_sent" };

  const age = now.getTime() - inboundAt;
  if (age >= REMINDER_UNTIL_MS) return { send: false, reason: "window_closed" };
  if (!inBusiness(now)) return { send: false, reason: "outside_business_hours" };
  if (age >= REMINDER_FROM_MS) return { send: true, windowKey };

  // Antes das 20h: só se a faixa ideal não tem horário comercial e este é o
  // último slot comercial antes dela (ex.: janela fecha de madrugada).
  if (age < EARLY_FROM_MS) return { send: false, reason: "too_early" };
  const idealFrom = new Date(inboundAt + REMINDER_FROM_MS);
  const idealTo = new Date(inboundAt + REMINDER_UNTIL_MS);
  if (hasBusinessSlot(idealFrom, idealTo)) return { send: false, reason: "too_early" };
  const next = new Date(now.getTime() + SWEEP_INTERVAL_MS);
  if (next.getTime() < idealFrom.getTime() && inBusiness(next)) return { send: false, reason: "too_early" };
  return { send: true, windowKey };
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[.!?]+$/, "").trim();
}

const OPT_OUT_EXACT = new Set(["pare", "parar", "nao quero", "sair", "stop"]);

/** Mensagem curta de parada ("pare", "parar", "não quero", "sair", "stop"). */
export function isOptOutLike(body: string): boolean {
  return OPT_OUT_EXACT.has(normalize(body));
}

/** Texto do lembrete, na voz da empresa. Nunca "assistente virtual" nem "IA" solta. */
export function reminderText(introducedBefore: boolean): string {
  const intro = introducedBefore
    ? ""
    : "Somos a EventeIA, um serviço autônomo de prospecção de fornecedores. ";
  return `Oi! ${intro}Passando para lembrar do orçamento: consegue nos mandar o valor? Assim já seguimos com a sua proposta. Obrigado!`;
}

export interface ReminderPorts {
  listCandidates(now: Date): Promise<ReminderCandidate[]>;
  /** Claim atômico: true só se ainda não houve lembrete para esta janela. */
  claim(conversationId: string, windowKey: string, now: Date): Promise<boolean>;
  /** Desfaz o claim quando o envio falha (permite nova tentativa no próximo ciclo). */
  release(conversationId: string, windowKey: string): Promise<void>;
  send(candidate: ReminderCandidate, text: string): Promise<{ ok: boolean; messageId: string | null }>;
  recordOutbound(conversationId: string, text: string, messageId: string | null): Promise<void>;
}

export interface ReminderSweepResult {
  sent: number;
  skipped: Partial<Record<SkipReason | "claim_lost" | "send_failed", number>>;
}

/** Job idempotente (repetível a cada 15 min). */
export async function runWindowReminderSweep(ports: ReminderPorts, now: Date = new Date()): Promise<ReminderSweepResult> {
  const result: ReminderSweepResult = { sent: 0, skipped: {} };
  const bump = (k: keyof ReminderSweepResult["skipped"]) => {
    result.skipped[k] = (result.skipped[k] ?? 0) + 1;
  };
  if (!inBusiness(now)) return result;
  for (const candidate of await ports.listCandidates(now)) {
    const decision = decideReminder(candidate, now);
    if (!decision.send) {
      bump(decision.reason);
      continue;
    }
    if (!(await ports.claim(candidate.conversationId, decision.windowKey, now))) {
      bump("claim_lost");
      continue;
    }
    const text = reminderText(candidate.introducedBefore);
    const sent = await ports.send(candidate, text);
    if (!sent.ok) {
      await ports.release(candidate.conversationId, decision.windowKey);
      bump("send_failed");
      continue;
    }
    await ports.recordOutbound(candidate.conversationId, text, sent.messageId);
    result.sent += 1;
  }
  return result;
}
