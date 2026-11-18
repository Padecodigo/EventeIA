import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Troca de e-mail no perfil: updateUser + emailRedirectTo /auth/callback.
 * Contas Google também podem trocar; o login social permanece no Gmail original.
 */

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
}));

const cookieSet = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: cookieSet }),
  headers: () =>
    Promise.resolve(new Headers({ host: "localhost:3100", "x-forwarded-proto": "http" })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        getUser: m.getUser,
        updateUser: m.updateUser,
      },
    }),
}));

import { changeEmailAction } from "@/app/(dashboard)/perfil/email-actions";

function fd(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const googleUser = { id: "u-google", email: "ana@gmail.com", identities: [{ provider: "google" }] };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.APP_URL;
  delete process.env.SITE_URL;
  m.getUser.mockResolvedValue({ data: { user: googleUser }, error: null });
});

describe("troca de e-mail no perfil", () => {
  it("recusa e-mail inválido sem chamar o Supabase", async () => {
    const r = await changeEmailAction({}, fd({ email: "x" }));
    expect(r.error).toBe("Informe um e-mail válido.");
    expect(m.updateUser).not.toHaveBeenCalled();
  });

  it("recusa quando o novo e-mail é igual ao atual", async () => {
    const r = await changeEmailAction({}, fd({ email: "Ana@gmail.com" }));
    expect(r.error).toBe("O novo e-mail é igual ao atual.");
    expect(m.updateUser).not.toHaveBeenCalled();
  });

  it("conta Google pode trocar: envia confirmação e volta pelo /auth/callback", async () => {
    m.updateUser.mockResolvedValue({ data: { user: googleUser }, error: null });
    const r = await changeEmailAction({}, fd({ email: "ana.nova@eventeia.com.br" }));
    expect(r.success).toMatch(/confirmação para o novo e-mail/);
    expect(m.updateUser).toHaveBeenCalledWith(
      { email: "ana.nova@eventeia.com.br" },
      { emailRedirectTo: "http://localhost:3100/auth/callback" },
    );
    expect(cookieSet).toHaveBeenCalledWith(
      "eventeia_auth_next",
      "/perfil",
      expect.objectContaining({ httpOnly: true, path: "/auth/callback" }),
    );
  });

  it("e-mail já cadastrado vira mensagem amigável", async () => {
    m.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });
    const r = await changeEmailAction({}, fd({ email: "outra@eventeia.com.br" }));
    expect(r.error).toBe("Este e-mail já tem uma conta.");
  });

  it("sem sessão não altera nada", async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const r = await changeEmailAction({}, fd({ email: "nova@eventeia.com.br" }));
    expect(r.error).toMatch(/sessão/);
    expect(m.updateUser).not.toHaveBeenCalled();
  });
});
