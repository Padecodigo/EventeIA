import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { looksLikeSessionProblem } from "@/lib/evolution-api/client";

describe("Evolution — classificação de erro de sessão", () => {
  it("trata instância inexistente (404) como sessão perdida", () => {
    const body = '{"status":404,"error":"Not Found","response":{"message":["The \\"eventeia-3d910b73\\" instance does not exist"]}}';
    expect(looksLikeSessionProblem(404, body)).toBe(true);
  });
  it("mantém 401/403 e textos de desconexão como sessão", () => {
    expect(looksLikeSessionProblem(401, "")).toBe(true);
    expect(looksLikeSessionProblem(400, "instance not connected")).toBe(true);
  });
  it("não confunde erro comum (número inválido) com sessão", () => {
    expect(looksLikeSessionProblem(400, '{"message":"number invalid"}')).toBe(false);
    expect(looksLikeSessionProblem(500, "internal error")).toBe(false);
  });
});
