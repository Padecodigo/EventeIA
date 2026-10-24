import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração de /api/cupom-sorte + lib/lucky/server (Supabase e next/headers mockados).
 * O "banco" falso reproduz o contrato da 0025: 1 cupom por aparelho, sem re-sorteio,
 * elegível só com boas-vindas expirada/usada, prazo pelo relógio do banco.
 */
const rpc = vi.fn();
const cookieStore = new Map<string, string>();
let sessionUserId: string | null = null;

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ rpc }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: sessionUserId === null ? null : { id: sessionUserId } },
      }),
    },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => cookieStore.set(name, value),
  }),
  headers: async () => ({
    get: (k: string) => (k.toLowerCase() === "x-forwarded-for" ? "198.51.100.7" : null),
  }),
}));

const { GET, POST } = await import("@/app/api/cupom-sorte/route");
const { reserveLuckyCoupon } = await import("@/lib/lucky/server");

type Welcome = "active" | "expired" | "redeemed" | "none";
let welcome: Welcome;
interface Row {
  percent: number;
  code: string;
  createdAt: number;
  expiresAt: number;
  redrawAt: number;
  superseded: boolean;
}
let rows: Row[];
let stored: Row | null;
let now: number;
const H = 3_600_000;

function fakeDb() {
  rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    const server_now = new Date(now).toISOString();
    const iso = (t: number) => new Date(t).toISOString();
    if (fn === "lucky_coupon_reserve") {
      return stored !== null && !stored.superseded && stored.expiresAt > now
        ? {
            data: [
              { code: stored.code, percent: stored.percent, expires_at: iso(stored.expiresAt) },
            ],
            error: null,
          }
        : { data: [], error: null };
    }
    if (welcome === "active" || welcome === "none") {
      return {
        data: [
          {
            status: "ineligible",
            code: null,
            percent: null,
            expires_at: null,
            redraw_at: null,
            server_now,
            created: false,
          },
        ],
        error: null,
      };
    }
    if (stored === null || stored.redrawAt <= now) {
      if (args.p_percent === null) {
        return {
          data: [
            {
              status: "available",
              code: null,
              percent: null,
              expires_at: null,
              redraw_at: null,
              server_now,
              created: false,
            },
          ],
          error: null,
        };
      }
      if (stored !== null) stored.superseded = true;
      const window = args.p_window_hours as number;
      const validity = args.p_validity_hours as number;
      expect(validity).toBeLessThanOrEqual(window);
      stored = {
        percent: args.p_percent as number,
        code: `SORTE-${String(rows.length).padStart(8, "0")}`,
        createdAt: now,
        expiresAt: now + validity * H,
        redrawAt: now + window * H,
        superseded: false,
      };
      rows.push(stored);
      return {
        data: [
          {
            status: "active",
            code: stored.code,
            percent: stored.percent,
            expires_at: iso(stored.expiresAt),
            redraw_at: iso(stored.redrawAt),
            server_now,
            created: true,
          },
        ],
        error: null,
      };
    }
    const active = stored.expiresAt > now;
    return {
      data: [
        {
          status: active ? "active" : "expired",
          code: active ? stored.code : null,
          percent: stored.percent,
          expires_at: iso(stored.expiresAt),
          redraw_at: iso(stored.redrawAt),
          server_now,
          created: false,
        },
      ],
      error: null,
    };
  });
}

function post(origin = "http://localhost:3000", body: unknown = {}) {
  const { NextRequest } = require("next/server") as typeof import("next/server");
  return new NextRequest("http://localhost:3000/api/cupom-sorte", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  rpc.mockReset();
  cookieStore.clear();
  cookieStore.set("ev_vid", "aparelho_de_teste_1234567890");
  sessionUserId = null;
  welcome = "expired";
  stored = null;
  rows = [];
  now = Date.parse("2026-10-24T12:00:00Z");
  process.env.WELCOME_HASH_SALT = "salt-integracao-0123456789";
  process.env.B2C_TICKET_PRICE_CENTS = "9700";
  fakeDb();
});

describe("/api/cupom-sorte", () => {
  it("boas-vindas expirada ⇒ GET mostra o botão (available) sem sortear", async () => {
    const json = await (await GET()).json();
    expect(json).toMatchObject({ status: "available", percent: null, code: null });
    expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_percent).toBeNull();
    expect(stored).toBeNull();
  });

  it("boas-vindas usada (redeemed) também libera o botão", async () => {
    welcome = "redeemed";
    expect((await (await GET()).json()).status).toBe("available");
  });

  it("nunca revela as duas: boas-vindas ativa ⇒ ineligible, e POST não sorteia", async () => {
    welcome = "active";
    expect((await (await GET()).json()).status).toBe("ineligible");
    const json = await (await POST(post())).json();
    expect(json.status).toBe("ineligible");
    expect(stored).toBeNull();
  });

  it("sorteia no servidor 20..40, com preço final e prazo de 24h do banco", async () => {
    const json = await (await POST(post())).json();
    expect(json.status).toBe("active");
    expect(json.percent).toBeGreaterThanOrEqual(20);
    expect(json.percent).toBeLessThanOrEqual(40);
    expect(json.finalPriceCents).toBe(9700 - Math.floor((9700 * json.percent) / 100));
    expect(json.remainingMs).toBe(24 * H);
    expect(json.redrawInMs).toBe(48 * H);
    const lookupArgs = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(lookupArgs).toMatchObject({ p_window_hours: 48, p_validity_hours: 24 });
    expect(json.created).toBe(true);
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("198.51.100.7");
  });

  it("ignora percentual enviado pelo client", async () => {
    const percents = new Set<number>();
    for (let i = 0; i < 30; i += 1) {
      stored = null;
      rpc.mockClear();
      await POST(post(undefined, { percent: 99, p_percent: 99 }));
      percents.add((rpc.mock.calls[0]?.[1] as Record<string, number>).p_percent);
    }
    for (const p of percents) {
      expect(p).toBeGreaterThanOrEqual(20);
      expect(p).toBeLessThanOrEqual(40);
    }
  });

  it("idempotente: cliques e recargas devolvem o mesmo cupom", async () => {
    const first = await (await POST(post())).json();
    const second = await (await POST(post())).json();
    const reload = await (await GET()).json();
    expect(second).toMatchObject({
      status: "active",
      percent: first.percent,
      code: first.code,
      created: false,
    });
    expect(reload).toMatchObject({ status: "active", percent: first.percent, code: first.code });
  });

  it("sorteou + não usou + tentou de novo na hora = bloqueado (mesmo cupom, sem novo sorteio)", async () => {
    const first = await (await POST(post())).json();
    now += 60_000;
    const again = await (await POST(post())).json();
    expect(again).toMatchObject({
      status: "active",
      code: first.code,
      percent: first.percent,
      created: false,
    });
    expect(rows).toHaveLength(1);
  });

  it("expira em 24h e, dentro da janela de 48h, não reaparece nem re-sorteia", async () => {
    await POST(post());
    now += 24 * H + 1;
    const json = await (await POST(post())).json();
    expect(json).toMatchObject({ status: "expired", percent: null, code: null, remainingMs: 0 });
    expect(json.redrawInMs).toBe(24 * H - 1);
    expect(rows).toHaveLength(1);
  });

  it("após 48h pode sortear de novo: novo percentual 20..40 e o anterior é invalidado", async () => {
    const first = await (await POST(post())).json();
    now += 48 * H;
    expect((await (await GET()).json()).status).toBe("available");
    const second = await (await POST(post())).json();
    expect(second).toMatchObject({ status: "active", created: true });
    expect(second.code).not.toBe(first.code);
    expect(second.percent).toBeGreaterThanOrEqual(20);
    expect(second.percent).toBeLessThanOrEqual(40);
    expect(rows[0]?.superseded).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("bloqueia CSRF e aplica rate limit", async () => {
    expect((await POST(post("https://malicioso.example"))).status).toBe(403);
    rpc.mockResolvedValue({ data: null, error: { code: "P0429", message: "rate_limited" } });
    expect((await POST(post())).status).toBe(429);
  });

  it("falha fechada sem salt", async () => {
    delete process.env.WELCOME_HASH_SALT;
    expect((await (await POST(post())).json()).status).toBe("unavailable");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("reserveLuckyCoupon (checkout)", () => {
  it("usa o percentual gravado no banco e recusa expirado", async () => {
    await POST(post());
    const reserved = await reserveLuckyCoupon(
      "b2222222-2222-4222-8222-222222222222",
      "e1111111-1111-4111-8111-111111111111",
    );
    expect(reserved).toMatchObject({ code: stored?.code, percent: stored?.percent });
    now += 24 * H + 1;
    expect(
      await reserveLuckyCoupon(
        "b2222222-2222-4222-8222-222222222222",
        "e1111111-1111-4111-8111-111111111111",
      ),
    ).toBeNull();
  });

  it("rejeita percentual fora do intervalo vindo do banco", async () => {
    rpc.mockResolvedValue({
      data: [{ code: "SORTE-X", percent: 90, expires_at: "2026-10-25T00:00:00Z" }],
      error: null,
    });
    expect(await reserveLuckyCoupon("b2222222-2222-4222-8222-222222222222", "e1")).toBeNull();
  });
});
