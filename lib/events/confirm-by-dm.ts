import { confirmationCodesFromText } from "./confirmation-code";

/**
 * DM no Instagram com código de confirmação → confirma e publica o evento.
 * Roda ANTES (e independente) do casamento com fornecedor: vale para qualquer remetente.
 *
 * Anti força-bruta: tentativas com código inexistente contam por remetente (janela de
 * 1h). Acima do teto, a mensagem é ignorada em silêncio (sem consulta ao banco nem
 * resposta). A resposta "código não encontrado" só sai nas primeiras tentativas.
 */

export const MAX_FAILED_ATTEMPTS_PER_HOUR = 5;
const NOT_FOUND_REPLIES = 2;

export interface ConfirmableEvent {
  id: string;
  title: string;
  status: string;
  confirmedAt: string | null;
  deleted: boolean;
}

export interface ConfirmByDmPorts {
  findByCode(code: string): Promise<ConfirmableEvent | null>;
  /** Marca confirmado (idempotente: só quando ainda não confirmado). true se marcou agora. */
  markConfirmed(eventId: string): Promise<boolean>;
  /** Inicia a descoberta se o evento já estiver ativo e com entrevista concluída. */
  kickoff(eventId: string): Promise<unknown>;
  /** Contador de tentativas falhas do remetente (sem incrementar). */
  failedAttempts(senderId: string): Promise<number>;
  /** Incrementa e devolve o novo total. */
  recordFailedAttempt(senderId: string): Promise<number>;
  reply(text: string): Promise<unknown>;
  log(message: string, context: Record<string, unknown>): void;
}

export type ConfirmByDmResult =
  | { handled: false }
  | { handled: true; outcome: "confirmed" | "already_confirmed" | "unavailable" | "not_found" | "throttled"; eventId?: string };

const PERSONA = "Somos a EventeIA, um serviço autônomo de prospecção de fornecedores.";
const CLOSED = new Set(["canceled", "completed", "closed"]);

export function confirmedReply(code: string, title: string, active: boolean): string {
  const next = active
    ? "A busca de fornecedores já pode começar."
    : "A busca de fornecedores começa assim que a ativação do evento for concluída no site.";
  return `${PERSONA} Recebemos o código ${code}: o evento "${title}" está confirmado e publicado. ${next}`;
}

export async function confirmEventByDm(
  ports: ConfirmByDmPorts,
  input: { senderId: string; text: string },
): Promise<ConfirmByDmResult> {
  const codes = confirmationCodesFromText(input.text);
  if (codes.length === 0) return { handled: false };

  if ((await ports.failedAttempts(input.senderId)) >= MAX_FAILED_ATTEMPTS_PER_HOUR) {
    ports.log("confirmação por DM: remetente acima do teto de tentativas — ignorado", { senderId: input.senderId });
    return { handled: true, outcome: "throttled" };
  }

  for (const code of codes) {
    const event = await ports.findByCode(code);
    if (event === null) continue;
    if (event.deleted || CLOSED.has(event.status)) {
      await ports.reply(`${PERSONA} O código ${code} pertence a um evento encerrado e não pode ser confirmado.`);
      return { handled: true, outcome: "unavailable", eventId: event.id };
    }
    if (event.confirmedAt !== null) {
      await ports.reply(`${PERSONA} O evento "${event.title}" já está confirmado e publicado.`);
      return { handled: true, outcome: "already_confirmed", eventId: event.id };
    }
    const marked = await ports.markConfirmed(event.id);
    if (marked) {
      ports.log("evento confirmado por código via DM", { eventId: event.id });
      await ports.kickoff(event.id);
      await ports.reply(confirmedReply(code, event.title, event.status === "active"));
      return { handled: true, outcome: "confirmed", eventId: event.id };
    }
    return { handled: true, outcome: "already_confirmed", eventId: event.id };
  }

  const total = await ports.recordFailedAttempt(input.senderId);
  ports.log("confirmação por DM: código não encontrado", { senderId: input.senderId, attempts: total });
  if (total <= NOT_FOUND_REPLIES) {
    await ports.reply(`${PERSONA} Não encontramos esse código. Confira o código na página do seu evento e envie de novo.`);
  }
  return { handled: true, outcome: "not_found" };
}
