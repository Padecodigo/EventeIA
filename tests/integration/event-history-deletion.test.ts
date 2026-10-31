import { beforeEach, describe, expect, it, vi } from "vitest";

/** Integração: actions de apagar/desfazer histórico (0075). Supabase/Next mockados. */
const rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResult: { data: unknown; error: { code?: string } | null } = { data: 1, error: null };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve({ id: "u" }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      rpc: (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return Promise.resolve(rpcResult);
      },
    }),
}));

const { deleteEventHistoryAction, undoEventDeletionAction } = await import("@/app/(dashboard)/perfil/history-actions");
const EVENT_ID = "11111111-1111-4111-8111-111111111111";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  rpcCalls.length = 0;
  rpcResult = { data: 1, error: null };
});

describe("apagar histórico", () => {
  it("sem APAGAR não chama o banco", async () => {
    const r = await deleteEventHistoryAction({}, form({ scope: "one", eventId: EVENT_ID, confirmation: "apaga" }));
    expect(r.error).toMatch(/APAGAR/);
    expect(rpcCalls).toHaveLength(0);
  });
  it("apaga um evento", async () => {
    const r = await deleteEventHistoryAction({}, form({ scope: "one", eventId: EVENT_ID, confirmation: "APAGAR" }));
    expect(r).toEqual({ deleted: 1 });
    expect(rpcCalls[0]).toEqual({ fn: "request_event_history_deletion", args: { p_event_ids: [EVENT_ID] } });
  });
  it("apaga todo o histórico (null)", async () => {
    rpcResult = { data: 4, error: null };
    const r = await deleteEventHistoryAction({}, form({ scope: "all", confirmation: "APAGAR" }));
    expect(r).toEqual({ deleted: 4 });
    expect(rpcCalls[0]?.args).toEqual({ p_event_ids: null });
  });
  it("evento ativo: mensagem clara", async () => {
    rpcResult = { data: null, error: { code: "42501" } };
    const r = await deleteEventHistoryAction({}, form({ scope: "one", eventId: EVENT_ID, confirmation: "APAGAR" }));
    expect(r.error).toMatch(/encerrados/);
  });
  it("escopo inválido", async () => {
    const r = await deleteEventHistoryAction({}, form({ scope: "one", eventId: "x", confirmation: "APAGAR" }));
    expect(r.error).toBeDefined();
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("desfazer", () => {
  it("desfaz na carência", async () => {
    rpcResult = { data: true, error: null };
    await expect(undoEventDeletionAction({}, form({ eventId: EVENT_ID }))).resolves.toEqual({ undone: true });
  });
  it("após expurgo/30 dias informa que não dá mais", async () => {
    rpcResult = { data: null, error: { code: "42501" } };
    const r = await undoEventDeletionAction({}, form({ eventId: EVENT_ID }));
    expect(r.error).toMatch(/não é mais possível/i);
  });
});
