import { beforeEach, describe, expect, it, vi } from "vitest";

// Regressão (QA 25/10/2026): /entrar e /registrar renderizavam o formulário para quem já estava logado.
vi.mock("server-only", () => ({}));
let authed = false;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () =>
        authed
          ? { data: { user: { id: "u1", email: "u@x" } }, error: null }
          : { data: { user: null }, error: null },
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/components/auth/auth-form", () => ({ AuthForm: () => null }));

const entrar = (await import("@/app/(auth)/entrar/page")).default;
const registrar = (await import("@/app/(auth)/registrar/page")).default;
const sp = Promise.resolve({});

describe("páginas de autenticação com sessão ativa", () => {
  beforeEach(() => {
    authed = false;
  });
  it("logado em /entrar e /registrar → /painel", async () => {
    authed = true;
    await expect(entrar({ searchParams: sp })).rejects.toThrow("REDIRECT:/painel");
    await expect(registrar({ searchParams: sp })).rejects.toThrow("REDIRECT:/painel");
  });
  it("deslogado: renderiza o formulário", async () => {
    await expect(entrar({ searchParams: sp })).resolves.toBeTruthy();
    await expect(registrar({ searchParams: sp })).resolves.toBeTruthy();
  });
});
