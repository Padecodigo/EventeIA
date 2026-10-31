import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração: orçamento limite (0072) — edição via RPC set_event_budget_limit
 * (dono/admin; trigger audita) e mensagens pt-BR. Supabase/Next mockados.
 */
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcError: { code: string } | null = null;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: () => Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/events/cancel", () => ({ cancelEventFollowUp: vi.fn() }));
vi.mock("@/lib/events/stop", () => ({ stopEventBackgroundWork: vi.fn() }));
vi.mock("@/lib/feeds", () => ({ emitFeed: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: args.p_cents ?? null, error: rpcError });
    },
  }),
}));

const { updateBudgetLimitAction } = await import("@/app/(dashboard)/eventos/[id]/actions");

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  rpcCalls.length = 0;
  rpcError = null;
});

describe("editar orçamento limite", () => {
  it("salva o limite em centavos pela RPC auditada", async () => {
    const r = await updateBudgetLimitAction({}, form({ eventId: EVENT_ID, budgetLimit: "30.000,00" }));
    expect(r).toEqual({ saved: true });
    expect(rpcCalls).toEqual([
      { fn: "set_event_budget_limit", args: { p_event_id: EVENT_ID, p_cents: 3_000_000 } },
    ]);
  });

  it("campo vazio remove o limite", async () => {
    await updateBudgetLimitAction({}, form({ eventId: EVENT_ID, budgetLimit: "" }));
    expect(rpcCalls[0]?.args.p_cents).toBeNull();
  });

  it("valida antes de chamar o banco", async () => {
    const r = await updateBudgetLimitAction({}, form({ eventId: EVENT_ID, budgetLimit: "50" }));
    expect(r.error).toContain("entre R$ 100");
    const bad = await updateBudgetLimitAction({}, form({ eventId: "x", budgetLimit: "1000" }));
    expect(bad).toEqual({ error: "Evento não encontrado." });
    expect(rpcCalls).toHaveLength(0);
  });

  it("não dono/evento encerrado recebe mensagem clara (42501)", async () => {
    rpcError = { code: "42501" };
    const r = await updateBudgetLimitAction({}, form({ eventId: EVENT_ID, budgetLimit: "1000" }));
    expect(r.error).toContain("Só o dono do evento");
  });

  it("erro inesperado não vaza detalhes", async () => {
    rpcError = { code: "XX000" };
    const r = await updateBudgetLimitAction({}, form({ eventId: EVENT_ID, budgetLimit: "1000" }));
    expect(r).toEqual({ error: "Não foi possível salvar o orçamento limite. Tente novamente." });
  });
});
