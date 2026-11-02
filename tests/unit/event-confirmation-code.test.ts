import { describe, expect, it, vi } from "vitest";

import {
  confirmEventByDm,
  confirmedReply,
  MAX_FAILED_ATTEMPTS_PER_HOUR,
  type ConfirmByDmPorts,
  type ConfirmableEvent,
} from "@/lib/events/confirm-by-dm";
import {
  CONFIRMATION_CODE_ALPHABET,
  confirmationCodesFromText,
  normalizeConfirmationCode,
} from "@/lib/events/confirmation-code";

describe("código de confirmação — parser", () => {
  it("normaliza sem diferenciar maiúsculas e aceita variações de separador", () => {
    expect(normalizeConfirmationCode("evt-7k3q9a")).toBe("EVT-7K3Q9A");
    expect(normalizeConfirmationCode(" EVT 7K3Q9A ")).toBe("EVT-7K3Q9A");
    expect(normalizeConfirmationCode("EVT7K3Q9A")).toBe("EVT-7K3Q9A");
  });
  it("rejeita caracteres ambíguos e tamanho errado", () => {
    expect(normalizeConfirmationCode("EVT-0O1IL5")).toBeNull();
    expect(normalizeConfirmationCode("EVT-7K3Q9")).toBeNull();
    expect(normalizeConfirmationCode("EVT-7K3Q9AB")).toBeNull();
  });
  it("extrai do texto livre e não confunde com o código público de 8 caracteres", () => {
    expect(confirmationCodesFromText("Oi! meu código é evt-7k3q9a, obrigado")).toEqual(["EVT-7K3Q9A"]);
    expect(confirmationCodesFromText("vi o post EVT-ABCD2345")).toEqual([]);
    expect(confirmationCodesFromText("sem código aqui")).toEqual([]);
  });
  it("alfabeto não tem 0/O/1/I/L/U", () => {
    for (const ch of "01OILU") expect(CONFIRMATION_CODE_ALPHABET).not.toContain(ch);
  });
});

function ports(event: ConfirmableEvent | null, fails = 0) {
  let count = fails;
  const p = {
    findByCode: vi.fn(async () => event),
    markConfirmed: vi.fn(async () => true),
    kickoff: vi.fn(async () => "started"),
    failedAttempts: vi.fn(async () => count),
    recordFailedAttempt: vi.fn(async () => ++count),
    reply: vi.fn(async (_text: string) => undefined),
    log: vi.fn(),
  } satisfies ConfirmByDmPorts;
  return p;
}
const ev = (o: Partial<ConfirmableEvent> = {}): ConfirmableEvent => ({
  id: "e1", title: "Casamento", status: "draft", confirmedAt: null, deleted: false, ...o,
});

describe("confirmEventByDm", () => {
  it("sem código ⇒ não trata (segue fluxo normal)", async () => {
    const p = ports(ev());
    expect(await confirmEventByDm(p, { senderId: "u", text: "oi" })).toEqual({ handled: false });
    expect(p.findByCode).not.toHaveBeenCalled();
  });
  it("código válido de remetente desconhecido ⇒ confirma, chama kickoff e responde com a persona", async () => {
    const p = ports(ev({ status: "active" }));
    const r = await confirmEventByDm(p, { senderId: "desconhecido", text: "evt-7k3q9a" });
    expect(r).toMatchObject({ handled: true, outcome: "confirmed", eventId: "e1" });
    expect(p.markConfirmed).toHaveBeenCalledWith("e1");
    expect(p.kickoff).toHaveBeenCalledWith("e1");
    const text = p.reply.mock.calls[0]![0];
    expect(text).toContain("Somos a EventeIA, um serviço autônomo de prospecção de fornecedores");
    expect(text).not.toMatch(/assistente virtual/i);
    expect(text).not.toMatch(/\bIA\b/);
  });
  it("já confirmado ⇒ idempotente, sem novo kickoff", async () => {
    const p = ports(ev({ confirmedAt: "2026-11-01T00:00:00Z" }));
    expect(await confirmEventByDm(p, { senderId: "u", text: "EVT-7K3Q9A" })).toMatchObject({ outcome: "already_confirmed" });
    expect(p.markConfirmed).not.toHaveBeenCalled();
    expect(p.kickoff).not.toHaveBeenCalled();
  });
  it("evento cancelado ⇒ não confirma", async () => {
    const p = ports(ev({ status: "canceled" }));
    expect(await confirmEventByDm(p, { senderId: "u", text: "EVT-7K3Q9A" })).toMatchObject({ outcome: "unavailable" });
    expect(p.markConfirmed).not.toHaveBeenCalled();
  });
  it("código inexistente ⇒ conta tentativa; só responde nas 2 primeiras", async () => {
    const p = ports(null);
    for (let i = 0; i < 4; i++) await confirmEventByDm(p, { senderId: "u", text: "EVT-7K3Q9A" });
    expect(p.recordFailedAttempt).toHaveBeenCalledTimes(4);
    expect(p.reply).toHaveBeenCalledTimes(2);
  });
  it("força bruta: acima do teto ⇒ ignora em silêncio sem consultar o banco", async () => {
    const p = ports(ev(), MAX_FAILED_ATTEMPTS_PER_HOUR);
    expect(await confirmEventByDm(p, { senderId: "u", text: "EVT-7K3Q9A" })).toMatchObject({ outcome: "throttled" });
    expect(p.findByCode).not.toHaveBeenCalled();
    expect(p.reply).not.toHaveBeenCalled();
  });
  it("mensagem pendente de ativação menciona a ativação", () => {
    expect(confirmedReply("EVT-7K3Q9A", "X", false)).toContain("ativação");
  });
});
