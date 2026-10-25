import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let role: string | null = null;
let authed = true;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () =>
        authed
          ? { data: { user: { id: "u1", email: "u@x" } }, error: null }
          : { data: { user: null }, error: null },
    },
    from: () => {
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: role === null ? null : { role } }),
      };
      return b;
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const { requireAdmin, isAdminUser } = await import("@/lib/auth");

describe("admin superusuário", () => {
  beforeEach(() => {
    role = null;
    authed = true;
  });
  it("admin passa por requireAdmin e é reconhecido no painel", async () => {
    role = "admin";
    await expect(requireAdmin()).resolves.toMatchObject({ id: "u1" });
    await expect(isAdminUser("u1")).resolves.toBe(true);
  });
  it("regressão: usuário comum continua bloqueado no /admin", async () => {
    role = "user";
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/painel");
    await expect(isAdminUser("u1")).resolves.toBe(false);
  });
  it("regressão: sem perfil ou sem sessão não vira admin", async () => {
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/painel");
    authed = false;
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/entrar");
  });
});
