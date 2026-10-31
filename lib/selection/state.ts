/**
 * Máquina de estados da seleção de produtos (nível de categoria) — pura e determinística.
 *
 * O usuário escolhe UMA opção por fornecedor; o sistema nunca escolhe sozinho (não há
 * transição que crie/selecione uma opção sem um evento explícito do usuário). Estados:
 *
 *   pendente ──enviar──► enviado_ao_fornecedor ──entregue──► aguardando_resposta ──resposta──► respondido
 *        │                        │                                   │
 *        │ janela_fechada         │ janela_fechada / indisponivel     │ janela_fechada / indisponivel
 *        ▼                        ▼                                   ▼
 *   canal_fechado           canal_fechado / indisponivel        canal_fechado / indisponivel
 *
 * Funções puras: "agora"/eventos entram por parâmetro; sem I/O, sem relógio, sem aleatório.
 */

export const SELECTION_STATUSES = [
  "pendente",
  "enviado_ao_fornecedor",
  "aguardando_resposta",
  "respondido",
  "canal_fechado",
  "indisponivel",
] as const;

export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

export type SelectionEventType =
  | "enviar"
  | "entregue"
  | "resposta"
  | "janela_fechada"
  | "indisponivel";

export interface SelectionEvent {
  type: SelectionEventType;
}

/** Estado inicial de toda seleção — só é criado por uma ação explícita do usuário. */
export const SELECTION_INITIAL: SelectionStatus = "pendente";

/** Estados terminais: nada mais muda depois deles. */
export const SELECTION_TERMINAL: readonly SelectionStatus[] = [
  "respondido",
  "canal_fechado",
  "indisponivel",
];

const TRANSITIONS: Record<
  SelectionStatus,
  Partial<Record<SelectionEventType, SelectionStatus>>
> = {
  pendente: {
    enviar: "enviado_ao_fornecedor",
    janela_fechada: "canal_fechado",
    indisponivel: "indisponivel",
  },
  enviado_ao_fornecedor: {
    entregue: "aguardando_resposta",
    resposta: "respondido",
    janela_fechada: "canal_fechado",
    indisponivel: "indisponivel",
  },
  aguardando_resposta: {
    resposta: "respondido",
    janela_fechada: "canal_fechado",
    indisponivel: "indisponivel",
  },
  respondido: {},
  canal_fechado: {},
  indisponivel: {},
};

/** A transição `status ──event──►` é permitida? */
export function canTransition(status: SelectionStatus, event: SelectionEvent): boolean {
  return TRANSITIONS[status][event.type] !== undefined;
}

/** Próximo estado após o evento; retorna o mesmo estado quando a transição é inválida. */
export function nextStatus(status: SelectionStatus, event: SelectionEvent): SelectionStatus {
  return TRANSITIONS[status][event.type] ?? status;
}

/** Estado terminal? (respondido, canal_fechado ou indisponivel). */
export function isTerminal(status: SelectionStatus): boolean {
  return (SELECTION_TERMINAL as readonly string[]).includes(status);
}

/** Ainda aceita novo envio (único estado de onde a automação dispara o relay). */
export function isRelayable(status: SelectionStatus): boolean {
  return status === "pendente";
}
