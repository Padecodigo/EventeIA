import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração: data agendada para a busca — criar evento, editar na página do evento,
 * worker de descoberta adiando até a janela do dia escolhido. Supabase/fila mockados.
 */
const inserts: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
let eventRow: Record<string, unknown> = {};
const reschedule = vi.fn(async () => true);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }) }));
vi.mock("@/lib/feeds", () => ({ emitFeed: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { search_start_date: eventRow.search_start_date ?? null }, error: null }) };
      return q;
    },
  }),
}));
vi.mock("@/lib/discovery/runtime", () => ({ rescheduleDiscovery: reschedule, createDiscoveryDeps: vi.fn(), createRedisLlmUsage: vi.fn() }));
vi.mock("@/lib/ai/runtime", () => ({ createRouterUsageStore: vi.fn(), getRouter: vi.fn(() => null) }));
vi.mock("@/lib/discovery/engine", () => ({ runDiscoveryRound: vi.fn() }));
vi.mock("@/lib/discovery/providers/registry", () => ({ resolveProviders: vi.fn(() => []) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      if (table === "workspaces") {
        const q = { select: () => q, eq: () => q, limit: () => q, maybeSingle: async () => ({ data: { id: "ws-1" } }) };
        return q;
      }
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: eventRow }),
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "ev-1" }, error: null }) }) };
        },
        update: (row: Record<string, unknown>) => {
          updates.push(row);
          return { eq: async () => ({ error: null }) };
        },
      };
      return q;
    },
  }),
}));

const { createEventAction, updateSearchStartAction } = await import("@/app/(dashboard)/eventos/actions");
const { deferOutsideBusinessWindow, loadSearchStartDate } = await import("@/lib/queue/discovery-worker");

const EVENT_ID = "71e24ebd-0000-4000-8000-000000000001";
function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const base = { title: "Aniversário", eventType: "festa_infantil", eventDate: "2026-12-20", guestCount: "50", cityCode: "3550308" };
async function create(fields: Record<string, string>) {
  try {
    return await createEventAction({}, form(fields));
  } catch (e) {
    return { redirect: (e as Error).message };
  }
}

describe("agendamento do início da busca", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T10:00:00Z"));
    inserts.length = 0;
    updates.length = 0;
    reschedule.mockClear();
    eventRow = { id: EVENT_ID, event_date: "2026-12-20", discovery_started_at: null, quotes_delivered_at: null };
  });
  afterEach(() => vi.useRealTimers());

  it("padrão 'o quanto antes' grava null", async () => {
    await create(base);
    expect(inserts[0]).toMatchObject({ search_start_date: null });
  });
  it("data útil escolhida é persistida", async () => {
    await create({ ...base, searchStartMode: "date", searchStartDate: "2026-11-04" });
    expect(inserts[0]).toMatchObject({ search_start_date: "2026-11-04" });
  });
  it("servidor recusa fim de semana e feriado mesmo sem o seletor", async () => {
    expect(await create({ ...base, searchStartMode: "date", searchStartDate: "2026-10-31" })).toEqual({ error: expect.stringMatching(/dia útil/) });
    expect(await create({ ...base, searchStartMode: "date", searchStartDate: "2026-11-20" })).toEqual({ error: expect.stringMatching(/dia útil/) });
    expect(await create({ ...base, searchStartMode: "date", searchStartDate: "2026-10-23" })).toEqual({ error: expect.stringMatching(/passou/) });
    expect(inserts).toHaveLength(0);
  });

  it("edição na página do evento salva e reagenda a descoberta", async () => {
    const r = await updateSearchStartAction({}, form({ eventId: EVENT_ID, searchStartMode: "date", searchStartDate: "2026-11-04" }));
    expect(r).toEqual({ saved: true });
    expect(updates[0]).toEqual({ search_start_date: "2026-11-04" });
    expect(reschedule).toHaveBeenCalledWith(EVENT_ID, "2026-11-04");
  });
  it("edição recusa feriado (Proclamação) e depois que a busca começou", async () => {
    expect(await updateSearchStartAction({}, form({ eventId: EVENT_ID, searchStartMode: "date", searchStartDate: "2026-11-02" }))).toEqual({ error: expect.stringMatching(/dia útil/) });
    eventRow.discovery_started_at = "2026-10-26T12:00:00Z";
    expect(await updateSearchStartAction({}, form({ eventId: EVENT_ID, searchStartMode: "asap" }))).toEqual({ error: expect.stringMatching(/já começou/) });
    expect(updates).toHaveLength(0);
  });

  it("worker lê a data e adia até 9h de Brasília do dia agendado", async () => {
    eventRow.search_start_date = "2026-11-04";
    const startDate = await loadSearchStartDate(EVENT_ID);
    const job = { moveToDelayed: vi.fn(async () => undefined) };
    const now = new Date("2026-10-26T14:00:00Z"); // segunda em horário comercial
    expect(await deferOutsideBusinessWindow(job, "t", now, startDate)).toBe(true);
    expect(job.moveToDelayed).toHaveBeenCalledWith(Date.parse("2026-11-04T12:00:00Z"), "t");
  });
  it("no dia agendado em horário comercial, roda", async () => {
    const job = { moveToDelayed: vi.fn(async () => undefined) };
    expect(await deferOutsideBusinessWindow(job, "t", new Date("2026-11-04T13:00:00Z"), "2026-11-04")).toBe(false);
  });
});
