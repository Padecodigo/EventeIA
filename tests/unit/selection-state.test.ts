import { describe, expect, it } from "vitest";

import {
  SELECTION_INITIAL,
  SELECTION_TERMINAL,
  canTransition,
  isRelayable,
  isTerminal,
  nextStatus,
  type SelectionStatus,
} from "@/lib/selection/state";

const ALL: SelectionStatus[] = [
  "pendente",
  "enviado_ao_fornecedor",
  "aguardando_resposta",
  "respondido",
  "canal_fechado",
  "indisponivel",
];

describe("máquina de estados da seleção de produtos", () => {
  it("começa em pendente (só via ação explícita do usuário)", () => {
    expect(SELECTION_INITIAL).toBe("pendente");
  });

  it("pendente → enviado_ao_fornecedor com o evento enviar", () => {
    expect(nextStatus("pendente", { type: "enviar" })).toBe("enviado_ao_fornecedor");
  });

  it("enviado_ao_fornecedor → aguardando_resposta (entregue) e → respondido (resposta)", () => {
    expect(nextStatus("enviado_ao_fornecedor", { type: "entregue" })).toBe(
      "aguardando_resposta",
    );
    expect(nextStatus("aguardando_resposta", { type: "resposta" })).toBe("respondido");
  });

  it("fornecedor pode responder antes da confirmação de entrega", () => {
    expect(nextStatus("enviado_ao_fornecedor", { type: "resposta" })).toBe("respondido");
  });

  it("janela fechada leva pendente/enviado/aguardando a canal_fechado", () => {
    for (const status of ["pendente", "enviado_ao_fornecedor", "aguardando_resposta"] as const) {
      expect(nextStatus(status, { type: "janela_fechada" })).toBe("canal_fechado");
    }
  });

  it("indisponivel leva qualquer estado ativo a indisponivel", () => {
    for (const status of ["pendente", "enviado_ao_fornecedor", "aguardando_resposta"] as const) {
      expect(nextStatus(status, { type: "indisponivel" })).toBe("indisponivel");
    }
  });

  it("estados terminais não mudam com nenhum evento", () => {
    for (const status of SELECTION_TERMINAL) {
      for (const type of ["enviar", "entregue", "resposta", "janela_fechada", "indisponivel"] as const) {
        expect(nextStatus(status, { type })).toBe(status);
      }
    }
  });

  it("canTransition reflete as transições permitidas", () => {
    expect(canTransition("pendente", { type: "enviar" })).toBe(true);
    expect(canTransition("pendente", { type: "resposta" })).toBe(false);
    expect(canTransition("aguardando_resposta", { type: "resposta" })).toBe(true);
    expect(canTransition("respondido", { type: "resposta" })).toBe(false);
  });

  it("isTerminal cobre respondido/canal_fechado/indisponivel", () => {
    expect(SELECTION_TERMINAL).toEqual(["respondido", "canal_fechado", "indisponivel"]);
    for (const status of ALL) {
      expect(isTerminal(status)).toBe(
        status === "respondido" || status === "canal_fechado" || status === "indisponivel",
      );
    }
  });

  it("só pendente é relayável", () => {
    for (const status of ALL) {
      expect(isRelayable(status)).toBe(status === "pendente");
    }
  });
});
