import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));

const { runCostArchivePurge } = await import("@/lib/jobs/cost-archive-purge");

describe("job do arquivo morto (0076)", () => {
  it("chama purge_expired_cost_archive com a data atual e devolve o total", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: 3, error: null }));
    expect(await runCostArchivePurge({ rpc } as never, new Date("2031-11-01T06:50:00Z"))).toBe(3);
    expect(rpc).toHaveBeenCalledWith("purge_expired_cost_archive", { p_now: "2031-11-01T06:50:00.000Z" });
  });
  it("falha alto se a função der erro", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: { code: "42501" } }));
    await expect(runCostArchivePurge({ rpc } as never)).rejects.toThrow();
  });
});
