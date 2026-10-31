import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import {
  canDeleteFromHistory,
  canUndoDeletion,
  isDeleteConfirmed,
  isUserDeleted,
  purgeAfter,
} from "@/lib/events/history-deletion";
import { runEventHistoryPurge } from "@/lib/jobs/event-history-purge";

describe("regras do histórico", () => {
  it("só encerrados/excluídos podem ser apagados", () => {
    expect(canDeleteFromHistory("completed")).toBe(true);
    expect(canDeleteFromHistory("canceled")).toBe(true);
    for (const s of ["draft", "awaiting_payment", "active"]) expect(canDeleteFromHistory(s)).toBe(false);
  });
  it("confirmação exige APAGAR", () => {
    expect(isDeleteConfirmed("APAGAR")).toBe(true);
    expect(isDeleteConfirmed("  apagar ")).toBe(true);
    expect(isDeleteConfirmed("apaga")).toBe(false);
    expect(isDeleteConfirmed(null)).toBe(false);
  });
  it("carência de 30 dias", () => {
    const d = new Date("2026-10-01T12:00:00Z");
    expect(purgeAfter(d).toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(canUndoDeletion(d, new Date("2026-10-31T11:59:59Z"), false)).toBe(true);
    expect(canUndoDeletion(d, new Date("2026-10-31T12:00:00Z"), false)).toBe(false);
    expect(canUndoDeletion(d, new Date("2026-10-02T00:00:00Z"), true)).toBe(false);
  });
  it("rótulo do admin", () => {
    expect(isUserDeleted({ user_deleted_at: "2026-10-01" })).toBe(true);
    expect(isUserDeleted({ user_deleted_at: null })).toBe(false);
  });
});

describe("job de expurgo", () => {
  it("chama a RPC com o instante e devolve a contagem", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: 3, error: null }));
    const now = new Date("2026-11-01T06:40:00Z");
    await expect(runEventHistoryPurge({ rpc }, now)).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith("purge_user_deleted_events", { p_now: now.toISOString() });
  });
  it("falha alto se a RPC falhar (BullMQ re-tenta)", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: { code: "42501" } }));
    await expect(runEventHistoryPurge({ rpc })).rejects.toThrow();
  });
});
