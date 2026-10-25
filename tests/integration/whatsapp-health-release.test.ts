import { beforeEach, describe, expect, it, vi } from "vitest";

/** Integração: varredura de saúde encerra (logout) conexões que não são mais necessárias. */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({ EVOLUTION_API_URL: "https://evo.test", EVOLUTION_API_KEY: "k" }),
  isConfigured: () => true,
}));
const logout = vi.fn(async (_i: string) => {});
const state = vi.fn(async (_i: string) => "open" as const);
vi.mock("@/lib/evolution-api/client", () => ({
  getConnectionState: (i: string) => state(i),
  logoutInstance: (i: string) => logout(i),
  EvolutionNotConfiguredError: class extends Error {},
  EvolutionSessionError: class extends Error {},
}));
vi.mock("@/lib/feeds", () => ({ emitFeed: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/queue", () => ({
  QUEUE_NAMES: { quotationProspecting: "q" },
  getQueue: () => ({ name: "q", isPaused: async () => false, resume: vi.fn() }),
}));
vi.mock("@/lib/whatsapp/session-runtime", () => ({
  createSessionDeps: vi.fn(),
  resumeEventJobs: vi.fn(),
}));
vi.mock("@/lib/whatsapp/session-manager", () => ({ handleSessionLost: vi.fn() }));

let instances: { id: string; instance_name: string; status: string; event_id: string | null }[] =
  [];
let events: Record<string, string | null> = {};
const updates: { id: unknown; patch: Record<string, unknown> }[] = [];
const deletes = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        order: () => ({ limit: async () => ({ data: instances, error: null }) }),
        eq: (_c: string, id: string) => ({
          maybeSingle: async () => ({
            data: table === "events" ? { collection_ended_at: events[id] ?? null } : null,
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_c: string, id: unknown) => {
          updates.push({ id, patch });
        },
      }),
      delete: deletes,
    }),
  }),
}));

import { runInstanceHealthSweep } from "@/lib/jobs/whatsapp-instance-health";

beforeEach(() => {
  logout.mockClear();
  updates.length = 0;
  instances = [];
  events = {};
});

describe("varredura: encerrar conexão não mais necessária", () => {
  it("coleta encerrada ⇒ logout (sem apagar) e marca disconnected", async () => {
    instances = [{ id: "1", instance_name: "a", status: "connected", event_id: "ev1" }];
    events = { ev1: "2026-10-20T00:00:00Z" };
    await runInstanceHealthSweep();
    expect(logout).toHaveBeenCalledWith("a");
    expect(updates[0]?.patch.status).toBe("disconnected");
    expect(deletes).not.toHaveBeenCalled();
  });

  it("coleta em andamento ou aberta ⇒ mantém a conexão", async () => {
    instances = [
      { id: "1", instance_name: "a", status: "active", event_id: "ev1" },
      { id: "2", instance_name: "b", status: "connected", event_id: "ev2" },
      { id: "3", instance_name: "c", status: "connected", event_id: null },
    ];
    events = { ev1: "2026-10-20T00:00:00Z", ev2: null };
    await runInstanceHealthSweep();
    expect(logout).not.toHaveBeenCalled();
  });
});
