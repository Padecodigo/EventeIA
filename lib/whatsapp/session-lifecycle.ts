/**
 * Ciclo de vida EFÊMERO da sessão WhatsApp do cliente (Agente Orçamentista).
 * connecting → active → draining → disconnected (logout gracioso na Evolution).
 * Qualquer estado pode cair direto em disconnected (sessão inválida/perdida).
 * Módulo puro: sem I/O, testável.
 */

export type SessionState = "connecting" | "active" | "draining" | "disconnected";

/**
 * A sessão fica conectada durante TODA a coleta: até 5 cotações por categoria
 * ou 24h (o que vier primeiro). Só desconecta depois de entregar as cotações.
 */
export const MIN_COLLECTION_WINDOW_MINUTES = 30;
export const MAX_COLLECTION_WINDOW_MINUTES = 48 * 60;
export const DEFAULT_COLLECTION_WINDOW_MINUTES = 24 * 60;
export const QUOTES_PER_CATEGORY_TARGET = 5;

const TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  connecting: ["active", "disconnected"],
  active: ["draining", "disconnected"],
  draining: ["disconnected"],
  disconnected: [],
};

export function canTransition(from: SessionState, to: SessionState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Lança se a transição for inválida (evita regressão de estado). */
export function assertTransition(from: SessionState, to: SessionState): void {
  if (!canTransition(from, to)) {
    throw new Error(`transição de sessão inválida: ${from} → ${to}`);
  }
}

/** Janela de coleta configurável, com clamp [30 min, 48 h]. */
export function resolveCollectionWindowMinutes(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) {
    return DEFAULT_COLLECTION_WINDOW_MINUTES;
  }
  return Math.min(
    MAX_COLLECTION_WINDOW_MINUTES,
    Math.max(MIN_COLLECTION_WINDOW_MINUTES, Math.round(raw)),
  );
}

export function computeDrainAtMs(activatedAtMs: number, windowMinutes: number): number {
  return activatedAtMs + resolveCollectionWindowMinutes(windowMinutes) * 60_000;
}

/** Envios só acontecem com a sessão ativa (draining = não inicia novos contatos). */
export function canSendFirstContact(state: SessionState): boolean {
  return state === "active";
}

/** Mapeia o status persistido (inclui legados) para o estado do ciclo de vida. */
export function toSessionState(status: string): SessionState {
  switch (status) {
    case "active":
    case "connected":
      return "active";
    case "draining":
      return "draining";
    case "connecting":
      return "connecting";
    default:
      return "disconnected";
  }
}

/**
 * Coleta completa quando TODAS as categorias do evento têm ao menos `target`
 * cotações. Sem categorias, nunca completa antecipadamente (vale o prazo de 48h).
 */
export function isCollectionComplete(
  quotesByCategory: Readonly<Record<string, number>>,
  categories: readonly string[],
  target: number = QUOTES_PER_CATEGORY_TARGET,
): boolean {
  if (categories.length === 0) return false;
  return categories.every((category) => (quotesByCategory[category] ?? 0) >= target);
}

/**
 * A conexão do WhatsApp do cliente ainda é necessária? Regra conservadora:
 * só deixa de ser quando a coleta do evento vinculado JÁ terminou
 * (`events.collection_ended_at` preenchido = cotações entregues) e a sessão
 * não está em coleta (active/draining). Sem evento vinculado, ou evento ainda
 * em coleta/aguardando, a conexão é mantida. Reparear para outro evento
 * revincula a instância (event_id novo, coleta em aberto) ⇒ mantida.
 */
export function shouldReleaseConnection(input: {
  evolutionState: "open" | "connecting" | "close";
  dbStatus: string;
  eventId: string | null;
  collectionEndedAt: string | null;
}): boolean {
  if (input.evolutionState !== "open") return false;
  if (input.eventId === null || input.collectionEndedAt === null) return false;
  // Status cru: "connected" (legado/varredura) NÃO é coleta em andamento.
  return input.dbStatus !== "active" && input.dbStatus !== "draining";
}
