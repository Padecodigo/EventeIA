import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração: edição pós-criação dos dados do evento (convidados, local e estilo).
 * Supabase/Next mockados; valida update e mensagens em pt-BR.
 */
let eventRow: { id: string; status: string } | null = null;
const updates: Record<string, unknown>[] = [];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/events/cancel", () => ({ cancelEventFollowUp: vi.fn() }));
vi.mock("@/lib/events/stop", () => ({ stopEventBackgroundWork: vi.fn() }));
vi.mock("@/lib/events/lifecycle", () => ({ canCancelEvent: () => true, canCompleteEvent: () => true }));
vi.mock("@/lib/feeds", () => ({ emitFeed: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: eventRow }),
        update: (row: Record<string, unknown>) => {
          updates.push(row);
          return {
            eq: () => ({
              select: async () => ({ data: [{ id: eventRow?.id ?? "ev-1" }], error: null }),
            }),
          };
        },
      };
      return q;
    },
  }),
}));

const { updateEventDetailsAction } = await import("@/app/(dashboard)/eventos/[id]/actions");

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function submit(fields: Record<string, string>) {
  return updateEventDetailsAction({}, form({ eventId: EVENT_ID, ...fields }));
}

beforeEach(() => {
  eventRow = { id: EVENT_ID, status: "active" };
  updates.length = 0;
});

describe("editar dados do evento", () => {
  it("salva convidados, capacidade/tipo do local e estilo", async () => {
    const result = await submit({
      guestCount: "150",
      venueCapacity: "200",
      venueType: "chacara",
      eventStyle: "rustico_chique",
    });
    expect(result).toEqual({ saved: true });
    expect(updates[0]).toEqual({
      guest_count: 150,
      venue_capacity: 200,
      venue_type: "chacara",
      event_style: "rustico_chique",
    });
  });

  it("aceita campos opcionais vazios como nulos", async () => {
    const result = await submit({
      guestCount: "80",
      venueCapacity: "",
      venueType: "",
      eventStyle: "",
    });
    expect(result).toEqual({ saved: true });
    expect(updates[0]).toMatchObject({
      guest_count: 80,
      venue_capacity: null,
      venue_type: null,
      event_style: null,
    });
  });

  it("capacidade menor que os convidados é apenas um aviso, não bloqueia o salvamento", async () => {
    const result = await submit({
      guestCount: "100",
      venueCapacity: "60",
      venueType: "salao",
      eventStyle: "moderno",
    });
    expect(result).toEqual({ saved: true });
    expect(updates[0]).toMatchObject({ guest_count: 100, venue_capacity: 60 });
  });

  it("rejeita convidados fora de 1..5000 sem tocar no banco", async () => {
    expect((await submit({ guestCount: "0" })).error).toBe(
      "Informe um número de convidados entre 1 e 5.000.",
    );
    expect((await submit({ guestCount: "5001" })).error).toBe(
      "Informe um número de convidados entre 1 e 5.000.",
    );
    expect(updates).toHaveLength(0);
  });

  it("rejeita tipo de local e estilo fora do catálogo", async () => {
    expect((await submit({ guestCount: "50", venueType: "castelo" })).error).toBe(
      "Escolha um tipo de local válido.",
    );
    expect((await submit({ guestCount: "50", eventStyle: "cyberpunk" })).error).toBe(
      "Escolha um estilo válido.",
    );
    expect(updates).toHaveLength(0);
  });

  it("não edita evento excluído", async () => {
    eventRow = { id: EVENT_ID, status: "canceled" };
    expect((await submit({ guestCount: "50" })).error).toBe(
      "Um evento excluído não pode ser editado.",
    );
    expect(updates).toHaveLength(0);
  });
});
