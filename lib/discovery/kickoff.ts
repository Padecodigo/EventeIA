/**
 * Inicia a descoberta de fornecedores (e o prazo de coleta) quando o evento
 * está ATIVO e a entrevista CONCLUÍDA — independente de COMO foi ativado
 * (Asaas, cortesia, crédito) e da ordem (entrevista antes/depois da ativação).
 *
 * Regressão: a ativação por cupom de cortesia (e por crédito) não chamava
 * `startDiscovery`; com a entrevista feita antes, nenhum job era enfileirado e
 * o evento ficava eternamente "preparando" sem nunca cotar.
 */
export interface KickoffDeps {
  loadEvent(eventId: string): Promise<{ status: string; interviewCompleted: boolean } | null>;
  startDiscovery(eventId: string): Promise<boolean>;
  warn(message: string, context: Record<string, unknown>): void;
}

export type KickoffResult = "started" | "not_ready" | "queue_unavailable" | "error";

export async function kickoffDiscoveryIfReady(
  deps: KickoffDeps,
  eventId: string,
): Promise<KickoffResult> {
  try {
    const event = await deps.loadEvent(eventId);
    if (event === null || event.status !== "active" || !event.interviewCompleted)
      return "not_ready";
    const queued = await deps.startDiscovery(eventId);
    if (!queued) {
      deps.warn("fila indisponível ao iniciar a descoberta", { eventId });
      return "queue_unavailable";
    }
    return "started";
  } catch (caught) {
    deps.warn("não foi possível iniciar a descoberta", {
      eventId,
      reason: caught instanceof Error ? caught.message : "desconhecido",
    });
    return "error";
  }
}
