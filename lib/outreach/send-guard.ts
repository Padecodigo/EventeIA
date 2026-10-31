import { isWithinBusinessWindow, OUTREACH_WINDOW } from "@/lib/business-days";

/**
 * Guarda de envio da automação de outreach (Meta).
 *
 * Regras de plataforma (ver .context/AGENTS.md e docs/canais-meta.md):
 *   - só respondemos a quem falou com a conta (janela padrão 24h ou 7d em ad);
 *   - nunca respondemos a conversa em opt-out;
 *   - quando a janela fecha, a conversa vira `canal_fechado`;
 *   - automação sai apenas em horário comercial brasileiro (dias úteis, 9h–18h);
 *   - NUNCA usamos a tag HUMAN_AGENT na automação.
 *
 * Decisão de produto (documentada em docs/canais-meta.md): uma resposta digitada
 * pelo próprio usuário no chat do app, dentro de uma janela Meta aberta, pode ser
 * relayada fora do horário comercial — é uma resposta humana direta, não automação.
 * Isso vale SOMENTE para o autor `user`; automação, seleção de fornecedor e
 * repasse de contato continuam restritos ao horário comercial.
 *
 * Funções puras: "agora" entra por parâmetro (determinístico e testável).
 */

export type SupplierConversationStatus = "open" | "canal_fechado" | "opted_out";

export interface SendGuardConversation {
  status: SupplierConversationStatus;
  windowExpiresAt: string | null;
}

export type SendBlockReason =
  | "opted_out"
  | "canal_fechado"
  | "window_closed"
  | "outside_business_hours";

export type SendDecision =
  | { ok: true; windowExpiresAt: Date }
  | { ok: false; reason: SendBlockReason };

export interface SendGuardOptions {
  /**
   * Resposta digitada por uma pessoa no chat do app (autor `user`). Dentro de uma
   * janela aberta, pode sair fora do horário comercial — nunca para automação.
   */
  allowOutsideBusinessHours?: boolean;
}

/** Pode a automação responder agora? Verifica opt-out, janela e horário comercial. */
export function canSend(
  conversation: SendGuardConversation,
  now: Date = new Date(),
  options: SendGuardOptions = {},
): SendDecision {
  if (conversation.status === "opted_out") return { ok: false, reason: "opted_out" };
  if (conversation.status === "canal_fechado") return { ok: false, reason: "canal_fechado" };
  if (conversation.windowExpiresAt === null) return { ok: false, reason: "window_closed" };

  const expiresAt = new Date(conversation.windowExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return { ok: false, reason: "window_closed" };
  if (now.getTime() > expiresAt.getTime()) return { ok: false, reason: "window_closed" };

  if (!options.allowOutsideBusinessHours && !isWithinBusinessWindow(now, OUTREACH_WINDOW)) {
    return { ok: false, reason: "outside_business_hours" };
  }

  return { ok: true, windowExpiresAt: expiresAt };
}

/** A automação responde SEMPRE como RESPONSE — nunca com a tag HUMAN_AGENT. */
export const AUTOMATION_MESSAGING_TYPE = "RESPONSE" as const;

/** True quando a tag informada é HUMAN_AGENT (proibida na automação). */
export function isHumanAgentTag(tag: string | null | undefined): boolean {
  return tag === "HUMAN_AGENT";
}
