import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/runtime", () => ({ createRouterUsageStore: vi.fn(), getRouter: vi.fn(() => null) }));
vi.mock("@/lib/discovery/engine", () => ({ runDiscoveryRound: vi.fn() }));
vi.mock("@/lib/discovery/providers/registry", () => ({ resolveProviders: vi.fn(() => []) }));
vi.mock("@/lib/discovery/runtime", () => ({ createDiscoveryDeps: vi.fn(), createRedisLlmUsage: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));

import { deferOutsideBusinessWindow } from "@/lib/queue/discovery-worker";

describe("descoberta: gating de dia útil no worker", () => {
  it("sábado → job movido (delayed) para segunda 9h SP, não descartado", async () => {
    const job = { moveToDelayed: vi.fn(async () => undefined) };
    const deferred = await deferOutsideBusinessWindow(job, "tok", new Date("2026-10-24T13:00:00Z"));
    expect(deferred).toBe(true);
    expect(job.moveToDelayed).toHaveBeenCalledWith(Date.parse("2026-10-26T12:00:00Z"), "tok");
  });
  it("feriado (Finados) → terça", async () => {
    const job = { moveToDelayed: vi.fn(async () => undefined) };
    await deferOutsideBusinessWindow(job, undefined, new Date("2026-11-02T14:00:00Z"));
    expect(job.moveToDelayed).toHaveBeenCalledWith(Date.parse("2026-11-03T12:00:00Z"), undefined);
  });
  it("dia útil em horário comercial → roda já", async () => {
    const job = { moveToDelayed: vi.fn(async () => undefined) };
    expect(await deferOutsideBusinessWindow(job, "t", new Date("2026-10-26T14:00:00Z"))).toBe(false);
    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });
});
