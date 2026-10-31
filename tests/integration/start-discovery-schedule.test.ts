import { beforeEach, describe, expect, it, vi } from "vitest";

/** Integração: startDiscovery/rescheduleDiscovery respeitam a data agendada e a janela 9h–18h. */
const added: { queue: string; name: string; opts: unknown }[] = [];
const jobs = new Map<string, { isDelayed: () => Promise<boolean>; changeDelay: ReturnType<typeof vi.fn> }>();
let startDate: string | null = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ DISCOVERY_DRY_RUN: false }) }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { search_start_date: startDate } }) };
      return q;
    },
  }),
}));
vi.mock("@/lib/queue", () => ({
  QUEUE_NAMES: { supplierDiscovery: "supplier-discovery-queue" },
  getRedisConnection: vi.fn(),
  enqueue: vi.fn(async (queue: string, name: string, _d: unknown, opts: unknown) => {
    added.push({ queue, name, opts });
    return true;
  }),
  getQueue: () => ({ getJob: async (id: string) => jobs.get(id) }),
}));

const { startDiscovery, rescheduleDiscovery } = await import("@/lib/discovery/runtime");
const SUN = new Date("2026-10-25T10:00:00Z");
const MON_9 = Date.parse("2026-10-26T12:00:00Z");
const WINDOW = 2880 * 60_000;

describe("startDiscovery com agendamento", () => {
  beforeEach(() => {
    added.length = 0;
    jobs.clear();
    startDate = null;
  });

  it("domingo 'o quanto antes' → job atrasado até segunda 9h", async () => {
    await startDiscovery("ev-1", SUN);
    const discover = added.find((a) => a.name === "discover");
    expect(discover?.opts).toMatchObject({ delayMs: MON_9 - SUN.getTime() });
  });

  it("data agendada → 9h daquele dia", async () => {
    startDate = "2026-11-04";
    await startDiscovery("ev-1", SUN);
    expect(added.find((a) => a.name === "discover")?.opts).toMatchObject({ delayMs: Date.parse("2026-11-04T12:00:00Z") - SUN.getTime() });
  });

  it("reagendar muda o atraso do job pendente", async () => {
    const job = { isDelayed: async () => true, changeDelay: vi.fn(async () => undefined) };
    jobs.set("discover-ev-1-r0", job);
    expect(await rescheduleDiscovery("ev-1", "2026-11-04", SUN)).toBe(true);
    const ms = Date.parse("2026-11-04T12:00:00Z") - SUN.getTime();
    expect(job.changeDelay).toHaveBeenCalledWith(ms);
  });

  it("sem job pendente não faz nada", async () => {
    expect(await rescheduleDiscovery("ev-1", null, SUN)).toBe(false);
  });
});
