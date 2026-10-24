/**
 * Ciclo de vida EFÊMERO da sessão WhatsApp do cliente (Agente Orçamentista).
 * connecting → active → draining → disconnected (logout gracioso na Evolution).
 * Qualquer estado pode cair direto em disconnected (sessão inválida/perdida).
 * Módulo puro: sem I/O, testável.
 */

export type SessionState = "connecting" | "active" | "draining" | "disconnected";

export const MIN_COLLECTION_WINDOW_MINUTES = 30;
export const MAX_COLLECTION_WINDOW_MINUTES = 60;
export const DEFAULT_COLLECTION_WINDOW_MINUTES = 45;

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

/** Janela de coleta configurável, com clamp [30, 60] minutos. */
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
