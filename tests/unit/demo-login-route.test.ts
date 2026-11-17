import { afterEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(() => Promise.resolve({
    auth: { signInWithPassword },
  })),
}));

vi.mock("@/lib/auth/oauth", () => ({
  publicOrigin: () => "http://localhost:3000",
}));

describe("GET /demo/entrar", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    signInWithPassword.mockClear();
  });

  it("sempre responde 404 em produção, mesmo com envs corretas", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_LOGIN_ENABLED", "true");
    vi.stubEnv("DEMO_LOGIN_SECRET", "s3gredo-de-teste");
    vi.stubEnv("DEMO_ANA_PASSWORD", "senha-de-teste");
    const { GET } = await import("@/app/demo/entrar/route");
    const res = await GET(new Request("http://localhost:3000/demo/entrar?secret=s3gredo-de-teste&user=ana"));
    expect(res.status).toBe(404);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("responde 404 com segredo errado fora de produção", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_LOGIN_ENABLED", "true");
    vi.stubEnv("DEMO_LOGIN_SECRET", "s3gredo-de-teste");
    vi.stubEnv("DEMO_ANA_PASSWORD", "senha-de-teste");
    const { GET } = await import("@/app/demo/entrar/route");
    const res = await GET(new Request("http://localhost:3000/demo/entrar?secret=errado&user=ana"));
    expect(res.status).toBe(404);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("redireciona (307) com segredo correto fora de produção", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_LOGIN_ENABLED", "true");
    vi.stubEnv("DEMO_LOGIN_SECRET", "s3gredo-de-teste");
    vi.stubEnv("DEMO_ANA_PASSWORD", "senha-de-teste");
    const { GET } = await import("@/app/demo/entrar/route");
    const res = await GET(new Request("http://localhost:3000/demo/entrar?secret=s3gredo-de-teste&user=ana"));
    expect(res.status).toBe(307);
    expect(signInWithPassword).toHaveBeenCalled();
  });
});
