import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { redirectIfSignedIn } = await import("@/lib/auth");

describe("redirectIfSignedIn", () => {
  beforeEach(() => {
    authed = false;
  });
  it("sem sessão: não redireciona (mostra o formulário)", async () => {
    await expect(redirectIfSignedIn()).resolves.toBeUndefined();
  });
  it("com sessão: vai para o painel", async () => {
    authed = true;
    await expect(redirectIfSignedIn()).rejects.toThrow("REDIRECT:/painel");
  });
});
