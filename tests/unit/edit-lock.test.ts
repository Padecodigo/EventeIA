import { describe, expect, it } from "vitest";

import { isEventStarted, scheduledSearchStartAt, STARTED_EVENT_LOCK_MESSAGE } from "@/lib/events/edit-lock";

const base = { status: "active", discovery_started_at: null, search_start_date: null };
// Busca agendada para 18/11/2026 → abre às 09:00 de Brasília (12:00Z).
const scheduled = { ...base, search_start_date: "2026-11-18" };

describe("trava de edição até o início agendado da busca", () => {
  it("instante agendado = 09:00 de Brasília do dia escolhido", () => {
    expect(scheduledSearchStartAt("2026-11-18")?.toISOString()).toBe("2026-11-18T12:00:00.000Z");
    expect(scheduledSearchStartAt(null)).toBeNull();
  });
  it("editável 1 segundo antes do início agendado", () => {
    expect(isEventStarted(scheduled, new Date("2026-11-18T11:59:59.000Z"))).toBe(false);
  });
  it("travado exatamente no início agendado", () => {
    expect(isEventStarted(scheduled, new Date("2026-11-18T12:00:00.000Z"))).toBe(true);
  });
  it("travado antes do agendado se a busca já começou", () => {
    expect(isEventStarted({ ...scheduled, discovery_started_at: "2026-11-01T12:00:00Z" }, new Date("2026-11-02T00:00:00Z"))).toBe(true);
  });
  it("ativo sem data agendada e sem busca segue editável", () => {
    expect(isEventStarted(base, new Date("2030-01-01T00:00:00Z"))).toBe(false);
  });
  it("rascunho nunca trava; encerrado sempre trava", () => {
    expect(isEventStarted({ ...scheduled, status: "draft" }, new Date("2030-01-01T00:00:00Z"))).toBe(false);
    expect(isEventStarted({ ...base, status: "completed" })).toBe(true);
  });
  it("mensagem explica que só o orçamento limite muda", () => {
    expect(STARTED_EVENT_LOCK_MESSAGE).toMatch(/orçamento limite/);
  });
});
