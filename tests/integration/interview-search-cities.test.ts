import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração: saveInterviewAction grava município IBGE do evento + cidades extras
 * de busca (search_city_codes). Supabase/next mockados.
 */
const updates: Record<string, unknown>[] = [];
const startDiscovery = vi.fn(async () => undefined);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u" }) }));
vi.mock("@/lib/discovery/kickoff-runtime", () => ({ kickoffDiscovery: startDiscovery }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.not = async () => ({ error: null });
      q.maybeSingle = async () => ({ data: { id: EVENT_ID, event_type: "aniversario", guest_count: 50, status: "active" } });
      q.upsert = async () => ({ error: null });
      q.update = (row: Record<string, unknown>) => {
        if (table === "events") updates.push(row);
        const u: Record<string, unknown> = { eq: () => u, not: async () => ({ error: null }), then: (r: (v: unknown) => void) => r({ error: null }) };
        return u;
      };
      return q;
    },
  }),
}));

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const { saveInterviewAction } = await import("@/app/(dashboard)/eventos/[id]/entrevista/actions");

async function submit(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ eventId: EVENT_ID, answers: "{}", ...fields })) f.set(k, v);
  try {
    return await saveInterviewAction({}, f);
  } catch (e) {
    return { redirect: (e as Error).message };
  }
}

describe("entrevista: cidade IBGE + cidades de busca", () => {
  beforeEach(() => {
    updates.length = 0;
    startDiscovery.mockClear();
  });

  it("grava cidade/UF/IBGE e extras válidos; dispara a descoberta", async () => {
    const r = await submit({ cityCode: "3554102", searchCityCodes: "3524402,3554102,9999999,3304557" });
    expect(r).toEqual({ redirect: `REDIRECT:/eventos/${EVENT_ID}` });
    expect(updates[0]).toMatchObject({
      city: "Taubaté",
      city_uf: "SP",
      city_ibge_code: 3554102,
      search_city_codes: [3524402, 3304557],
    });
    expect(startDiscovery).toHaveBeenCalledWith(EVENT_ID);
  });

  it("sem extras ⇒ search_city_codes null (busca só na cidade do evento)", async () => {
    await submit({ cityCode: "3304557" });
    expect(updates[0]).toMatchObject({ city: "Rio de Janeiro", city_uf: "RJ", search_city_codes: null });
  });

  it("regressão: rejeita cidade em texto livre / código inexistente", async () => {
    expect(await submit({ city: "Taubaté" })).toEqual({ error: "Escolha a cidade da festa na lista e responda as perguntas." });
    expect(await submit({ cityCode: "1234567" })).toEqual({ error: "Escolha a cidade da festa na lista." });
    expect(updates).toHaveLength(0);
  });
});
