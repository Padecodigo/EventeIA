import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração da rota /api/boas-vindas + lib/welcome/server com Supabase e next/headers mockados:
 * IP só chega ao banco como hash, código não vai ao client, prazo vem do relógio do banco.
 */
const rpc = vi.fn();
/** welcome_offer_touch_visit (0025) vai para um mock separado: o banco decide a perda. */
const touch = vi.fn(async (_fn: string, _args: unknown) => ({ data: "noop", error: null }));
const cookieStore = new Map<string, string>();
let requestHeaders: Record<string, string> = {};
let sessionUserId: string | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    rpc: (fn: string, args: unknown) =>
      fn === "welcome_offer_touch_visit" ? touch(fn, args) : rpc(fn, args),
  }),
}));
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
  headers: async () => ({ get: (k: string) => requestHeaders[k.toLowerCase()] ?? null }),
}));

const { GET, POST } = await import("@/app/api/boas-vindas/route");
const { bindWelcomeOfferToUser } = await import("@/lib/welcome/server");

function request(body: unknown, origin = "http://localhost:3000") {
  const { NextRequest } = require("next/server") as typeof import("next/server");
  return new NextRequest("http://localhost:3000/api/boas-vindas", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

function activeRow(created: boolean) {
  return {
    data: [
      {
        status: "active",
        code: "BEMVINDO-SECRETO1",
        expires_at: "2026-10-25T12:00:00Z",
        server_now: "2026-10-24T12:00:00Z",
        created,
      },
    ],
    error: null,
  };
}

beforeEach(() => {
  rpc.mockReset();
  touch.mockClear();
  cookieStore.clear();
  requestHeaders = { "x-forwarded-for": "203.0.113.9, 10.0.0.1" };
  sessionUserId = null;
  process.env.WELCOME_HASH_SALT = "salt-integracao-0123456789";
  process.env.B2C_TICKET_PRICE_CENTS = "9700";
});

describe("/api/boas-vindas", () => {
  it("emite para visitante de promo: hash no banco, cookie de aparelho, sem código no client", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "welcome_offer_lookup" ? activeRow(true) : { data: 0, error: null },
    );
    const response = await POST(request({ utm_source: "instagram" }));
    const json = await response.json();

    expect(json).toMatchObject({
      status: "active",
      created: true,
      remainingMs: 86_400_000,
      fullPriceCents: 9700,
      finalPriceCents: 4700,
      recentRedemptions: 0,
    });
    expect(JSON.stringify(json)).not.toContain("BEMVINDO");
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args.p_source).toBe("promo");
    expect(args.p_claim).toBe(true);
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("203.0.113.9");
    expect(cookieStore.get("ev_vid")).toMatch(/^[A-Za-z0-9_-]{20,64}$/);
  });

  it("usa o tempo do banco: relógio do client é irrelevante", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [
          {
            status: "active",
            code: "X",
            expires_at: "2026-10-24T12:00:10Z",
            server_now: "2026-10-24T12:00:00Z",
            created: false,
          },
        ],
        error: null,
      })
      .mockResolvedValue({ data: 3, error: null });
    const json = await (await POST(request({}))).json();
    expect(json.remainingMs).toBe(10_000);
    expect(json.recentRedemptions).toBe(3);
  });

  it("expirada não reaparece", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          status: "expired",
          code: null,
          expires_at: "2026-10-24T11:00:00Z",
          server_now: "2026-10-24T12:00:00Z",
          created: false,
        },
      ],
      error: null,
    });
    const json = await (await POST(request({}))).json();
    expect(json).toMatchObject({ status: "expired", remainingMs: 0, created: false });
  });

  it("bloqueia CSRF (outra origem) e aplica rate limit (429)", async () => {
    expect((await POST(request({}, "https://malicioso.example"))).status).toBe(403);
    rpc.mockResolvedValue({ data: null, error: { code: "P0429", message: "rate_limited" } });
    expect((await POST(request({}))).status).toBe(429);
  });

  it("falha fechada sem salt (200 'unavailable', sem tocar no banco)", async () => {
    delete process.env.WELCOME_HASH_SALT;
    const json = await (await GET()).json();
    expect(json.status).toBe("unavailable");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("vincula à conta logada na consulta", async () => {
    sessionUserId = "b2222222-2222-4222-8222-222222222222";
    rpc.mockResolvedValue(activeRow(false));
    await GET();
    expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_profile_id).toBe(sessionUserId);
  });
});

describe("bindWelcomeOfferToUser (cadastro por e-mail e callback do Google OAuth)", () => {
  it("vincula a oferta do aparelho à conta sem emitir nova", async () => {
    cookieStore.set("ev_vid", "aparelho_de_teste_1234567890");
    rpc.mockResolvedValue(activeRow(false));
    await bindWelcomeOfferToUser("c3333333-3333-4333-8333-333333333333");
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args).toMatchObject({
      p_profile_id: "c3333333-3333-4333-8333-333333333333",
      p_claim: false,
    });
  });

  it("nunca quebra o login (erro/rate limit engolidos)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0429", message: "rate_limited" } });
    await expect(
      bindWelcomeOfferToUser("c3333333-3333-4333-8333-333333333333"),
    ).resolves.toBeUndefined();
  });
});

describe("vínculo após login/cadastro com Google (dashboard layout pós /auth/callback)", () => {
  it("sem cookie de aparelho não consulta o banco", async () => {
    await bindWelcomeOfferToUser("c3333333-3333-4333-8333-333333333333");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("layout do dashboard vincula a oferta do aparelho ao usuário vindo do OAuth", async () => {
    vi.doMock("@/lib/auth", () => ({
      requireUser: async () => ({
        id: "d4444444-4444-4444-8444-444444444444",
        email: "g@gmail.com",
      }),
    }));
    vi.doMock("@/components/dashboard-nav", () => ({ DashboardNav: () => null }));
    vi.doMock("@/components/notifications/notifications-poller", () => ({
      NotificationsPoller: () => null,
    }));
    vi.doMock("@/app/(dashboard)/actions", () => ({ signOutAction: async () => undefined }));
    cookieStore.set("ev_vid", "aparelho_google_oauth_1234567");
    rpc.mockResolvedValue(activeRow(false));
    const { default: DashboardLayout } = await import("@/app/(dashboard)/layout");
    await DashboardLayout({ children: null });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_profile_id: "d4444444-4444-4444-8444-444444444444",
      p_claim: false,
    });
  });
});

describe("oferta vale só na 1ª visita (0025)", () => {
  const touchArgs = () =>
    touch.mock.calls.map((c) => (c as unknown[])[1] as Record<string, unknown>);

  it("1ª visita: cria cookie de visita (sessão) e vincula a oferta recém-emitida a ela", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "welcome_offer_lookup" ? activeRow(true) : { data: 0, error: null },
    );
    await POST(request({}));
    expect(cookieStore.get("ev_visit")).toMatch(/^[A-Za-z0-9_-]{20,64}$/);
    const calls = touchArgs();
    expect(calls[0]?.p_visit_hash).toBeNull(); // antes: sem visita ainda
    expect(calls.at(-1)?.p_visit_hash).toMatch(/^[0-9a-f]{64}$/); // depois: oferta presa a esta visita
    expect(JSON.stringify(calls)).not.toContain(cookieStore.get("ev_visit"));
  });

  it("recarregar na mesma visita mantém a oferta (mesmo hash de visita)", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "welcome_offer_lookup" ? activeRow(true) : { data: 0, error: null },
    );
    await POST(request({}));
    const firstHash = touchArgs().at(-1)?.p_visit_hash;
    touch.mockClear();
    rpc.mockImplementation(async (fn: string) =>
      fn === "welcome_offer_lookup" ? activeRow(false) : { data: 0, error: null },
    );
    const json = await (await POST(request({}))).json();
    expect(json.status).toBe("active");
    expect(touchArgs()).toHaveLength(1);
    expect(touchArgs()[0]?.p_visit_hash).toBe(firstHash);
  });

  it("2ª visita (cookie de sessão sumiu): consulta o banco SEM visita ⇒ perda; oferta volta como expired", async () => {
    cookieStore.set("ev_vid", "aparelho_de_teste_1234567890");
    rpc.mockResolvedValue({
      data: [
        {
          status: "expired",
          code: null,
          expires_at: "2026-10-24T12:00:00Z",
          server_now: "2026-10-24T12:00:00Z",
          created: false,
        },
      ],
      error: null,
    });
    const json = await (await POST(request({}))).json();
    expect(touchArgs()[0]).toMatchObject({ p_visit_hash: null });
    expect(json).toMatchObject({ status: "expired", remainingMs: 0 });
  });
});
