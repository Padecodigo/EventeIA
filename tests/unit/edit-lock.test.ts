import { describe, expect, it } from "vitest";

import { isEventStarted, STARTED_EVENT_LOCK_MESSAGE } from "@/lib/events/edit-lock";

const base = { discovery_started_at: null, interview_completed_at: null };

describe("isEventStarted", () => {
  it("rascunho e aguardando pagamento não estão travados", () => {
    expect(isEventStarted({ ...base, status: "draft" })).toBe(false);
    expect(isEventStarted({ ...base, status: "awaiting_payment", interview_completed_at: "x" })).toBe(false);
  });
  it("ativo antes da primeira entrevista ainda é editável", () => {
    expect(isEventStarted({ ...base, status: "active" })).toBe(false);
  });
  it("ativo com entrevista concluída ou busca iniciada está travado", () => {
    expect(isEventStarted({ ...base, status: "active", interview_completed_at: "x" })).toBe(true);
    expect(isEventStarted({ ...base, status: "active", discovery_started_at: "x" })).toBe(true);
  });
  it("encerrado está travado; excluído não usa esta regra", () => {
    expect(isEventStarted({ ...base, status: "completed" })).toBe(true);
    expect(isEventStarted({ ...base, status: "canceled" })).toBe(false);
  });
  it("mensagem explica que só o orçamento limite muda", () => {
    expect(STARTED_EVENT_LOCK_MESSAGE).toMatch(/orçamento limite/);
  });
});
