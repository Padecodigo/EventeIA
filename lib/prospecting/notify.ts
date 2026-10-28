import { logger } from "@/lib/logger";

/**
 * Notificação de escalonamento da prospecção.
 *
 * Sempre grava o evento canônico no feed (`vendor.escalated`); envia também
 * para o Telegram quando `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` existem.
 * Falhas de canal não derrubam o fluxo — são logadas.
 */

export interface EscalationNotice {
  conversationId: string;
  reason: string;
  supplierName?: string | null;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  fetchImpl?: typeof fetch;
}

export interface NotifyDeps {
  /** Grava o evento no feed de sistema. */
  feed: (type: string, payload: Record<string, unknown>) => Promise<void>;
  telegram?: TelegramConfig;
}

export interface NotifyResult {
  feed: boolean;
  telegram: boolean;
}

export function buildEscalationText(notice: EscalationNotice): string {
  const who = notice.supplierName ?? "fornecedor não identificado";
  return [
    "EventeIA · Prospecção",
    `Proposta fora dos critérios (${who}).`,
    `Conversa: ${notice.conversationId}`,
    `Motivo: ${notice.reason}`,
  ].join("\n");
}

export async function notifyEscalation(deps: NotifyDeps, notice: EscalationNotice): Promise<NotifyResult> {
  let feed = false;
  try {
    await deps.feed("vendor.escalated", { conversationId: notice.conversationId, reason: notice.reason });
    feed = true;
  } catch (error) {
    logger.error({ error: String(error) }, "falha ao gravar feed de escalonamento");
  }

  let telegram = false;
  if (deps.telegram !== undefined) {
    const fetcher = deps.telegram.fetchImpl ?? fetch;
    try {
      const response = await fetcher(`https://api.telegram.org/bot${deps.telegram.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: deps.telegram.chatId, text: buildEscalationText(notice) }),
      });
      telegram = response.ok;
      if (!response.ok) logger.warn({ status: response.status }, "Telegram recusou o escalonamento");
    } catch (error) {
      logger.warn({ error: String(error) }, "falha ao notificar Telegram");
    }
  }

  return { feed, telegram };
}
