import { describe, expect, it, vi } from "vitest";

import { kickoffDiscoveryIfReady, type KickoffDeps } from "@/lib/discovery/kickoff";

function deps(
  event: { status: string; interviewCompleted: boolean } | null,
  queued = true,
): KickoffDeps & { startDiscovery: ReturnType<typeof vi.fn> } {
  return { loadEvent: async () => event, startDiscovery: vi.fn(async () => queued), warn: vi.fn() };
}

describe("kickoffDiscoveryIfReady", () => {
  it("ativo + entrevista concluída ⇒ inicia a descoberta", async () => {
    const d = deps({ status: "active", interviewCompleted: true });
    expect(await kickoffDiscoveryIfReady(d, "e1")).toBe("started");
    expect(d.startDiscovery).toHaveBeenCalledWith("e1");
  });
  it("sem entrevista ⇒ não inicia (entrevista dispara depois)", async () => {
    const d = deps({ status: "active", interviewCompleted: false });
    expect(await kickoffDiscoveryIfReady(d, "e1")).toBe("not_ready");
    expect(d.startDiscovery).not.toHaveBeenCalled();
  });
  it("não ativo ⇒ não inicia", async () => {
    const d = deps({ status: "draft", interviewCompleted: true });
    expect(await kickoffDiscoveryIfReady(d, "e1")).toBe("not_ready");
  });
  it("evento inexistente ⇒ not_ready", async () => {
    expect(await kickoffDiscoveryIfReady(deps(null), "e1")).toBe("not_ready");
  });
  it("fila indisponível ⇒ avisa sem lançar", async () => {
    const d = deps({ status: "active", interviewCompleted: true }, false);
    expect(await kickoffDiscoveryIfReady(d, "e1")).toBe("queue_unavailable");
    expect(d.warn).toHaveBeenCalled();
  });
  it("erro ⇒ nunca trava o chamador", async () => {
    const d: KickoffDeps = {
      loadEvent: async () => {
        throw new Error("boom");
      },
      startDiscovery: vi.fn(),
      warn: vi.fn(),
    };
    expect(await kickoffDiscoveryIfReady(d, "e1")).toBe("error");
  });
});
