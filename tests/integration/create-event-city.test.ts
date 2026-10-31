import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração: createEventAction com município IBGE (novo formulário) e com
 * `region` legado; Supabase/next mockados. Também cobre /api/municipios.
 */
const inserts: Record<string, unknown>[] = [];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }) }));
vi.mock("@/lib/feeds", () => ({ emitFeed: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      if (table === "workspaces") {
        const q = { select: () => q, eq: () => q, limit: () => q, maybeSingle: async () => ({ data: { id: "ws-1" } }) };
        return q;
      }
      return {
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "ev-1" }, error: null }) }) };
        },
      };
    },
  }),
}));

const { createEventAction } = await import("@/app/(dashboard)/eventos/actions");
const { GET } = await import("@/app/api/municipios/route");

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const base = { title: "Aniversário", eventType: "festa_infantil", eventDate: "2027-01-10", guestCount: "50" };

async function submit(fields: Record<string, string>) {
  try {
    return await createEventAction({}, form(fields));
  } catch (e) {
    return { redirect: (e as Error).message };
  }
}

describe("criar evento com cidade", () => {
  beforeEach(() => {
    inserts.length = 0;
  });

  it("grava nome, UF, código IBGE e faixa regional derivada", async () => {
    const r = await submit({ ...base, cityCode: "3304557" });
    expect(r).toEqual({ redirect: "REDIRECT:/eventos/ev-1/entrevista" });
    expect(inserts[0]).toMatchObject({ city: "Rio de Janeiro", city_uf: "RJ", city_ibge_code: 3304557, region_code: "rj" });
  });

  it("cidade fora de SP/RJ/MG cai em 'outros'", async () => {
    await submit({ ...base, cityCode: "2927408" }); // Salvador
    expect(inserts[0]).toMatchObject({ city: "Salvador", city_uf: "BA", region_code: "outros" });
  });

  it("rejeita código inexistente e ausência de cidade", async () => {
    expect(await submit({ ...base, cityCode: "1234567" })).toEqual({ error: "Escolha a cidade do evento na lista." });
    expect(await submit({ ...base, cityCode: "" })).toEqual({ error: "Escolha a cidade do evento." });
    expect(inserts).toHaveLength(0);
  });

  it("regressão: campo region legado continua aceito", async () => {
    await submit({ ...base, region: "mg" });
    expect(inserts[0]).toMatchObject({ region_code: "mg" });
    expect(inserts[0]).not.toHaveProperty("city");
  });
});

describe("/api/municipios", () => {
  it("busca sem acento", async () => {
    const { NextRequest } = await import("next/server");
    const res = GET(new NextRequest("http://localhost/api/municipios?q=florianopolis"));
    const body = (await res.json()) as { results: { name: string; uf: string }[] };
    expect(body.results[0]).toMatchObject({ name: "Florianópolis", uf: "SC" });
  });

});

describe("criar evento com orçamento limite (0072)", () => {
  beforeEach(() => {
    inserts.length = 0;
  });

  it("grava o orçamento limite opcional em centavos (0072)", async () => {
    await submit({ ...base, cityCode: "3304557", budgetLimit: "25.000,00" });
    expect(inserts[0]).toMatchObject({ budget_limit_cents: 2_500_000 });
  });

  it("regressão: sem orçamento limite o evento nasce sem limite", async () => {
    await submit({ ...base, cityCode: "3304557" });
    expect(inserts[0]).toMatchObject({ budget_limit_cents: null });
  });

  it("orçamento limite inválido não cria o evento", async () => {
    const r = await submit({ ...base, cityCode: "3304557", budgetLimit: "abc" });
    expect(r).toEqual({ error: "Informe o orçamento limite em reais, ex.: 25.000 ou 25.000,00." });
    expect(inserts).toHaveLength(0);
  });
});
