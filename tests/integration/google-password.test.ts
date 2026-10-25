import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conta criada com Google → cria senha no perfil → entra com e-mail+senha
 * (mesmo usuário). E "Esqueci minha senha" para contas Google.
 */

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  reauthenticate: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUserById: vi.fn(() => Promise.resolve({ error: null })),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers({ host: "localhost:3100", "x-forwarded-proto": "http" })),
}));
vi.mock("@/lib/welcome/server", () => ({ bindWelcomeOfferToUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { updateUserById: m.updateUserById } } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        getUser: m.getUser,
        updateUser: m.updateUser,
        reauthenticate: m.reauthenticate,
        signInWithPassword: m.signInWithPassword,
        resetPasswordForEmail: m.resetPasswordForEmail,
      },
    }),
}));

import { requestPasswordResetAction, signInAction } from "@/app/(auth)/actions";
import { setPasswordAction } from "@/app/(dashboard)/perfil/password-actions";

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

describe("criar senha (conta Google)", () => {
  it("valida antes de chamar o Supabase", async () => {
    const r = await setPasswordAction({}, fd({ password: "Abcdef1!", confirm: "outra123" }));
    expect(r.error).toBe("As senhas não conferem.");
    expect(m.updateUser).not.toHaveBeenCalled();
  });

  it("salva a senha no mesmo usuário e depois entra com e-mail+senha", async () => {
    m.updateUser.mockResolvedValue({ data: { user: googleUser }, error: null });
    const r = await setPasswordAction({}, fd({ password: "Abcdef1!", confirm: "Abcdef1!" }));
    expect(r.success).toMatch(/e-mail e senha ou com o Google/);
    expect(m.updateUser).toHaveBeenCalledWith({ password: "Abcdef1!" });
    expect(m.updateUserById).toHaveBeenCalledWith("u-google", {
      app_metadata: { has_password: true },
    });

    m.signInWithPassword.mockResolvedValue({ data: { user: googleUser }, error: null });
    await expect(
      signInAction({}, fd({ email: "ana@gmail.com", password: "Abcdef1!" })),
    ).rejects.toThrow("REDIRECT:/painel");
    expect(m.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@gmail.com",
      password: "Abcdef1!",
    });
  });

  it("reautenticação: envia código e conclui com o nonce", async () => {
    m.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: {
        code: "reauthentication_needed",
        message: "Password update requires reauthentication",
      },
    });
    m.reauthenticate.mockResolvedValue({ data: {}, error: null });
    const first = await setPasswordAction({}, fd({ password: "Abcdef1!", confirm: "Abcdef1!" }));
    expect(first.needsNonce).toBe(true);
    expect(m.reauthenticate).toHaveBeenCalledTimes(1);

    m.updateUser.mockResolvedValueOnce({ data: { user: googleUser }, error: null });
    const second = await setPasswordAction(
      first,
      fd({ password: "Abcdef1!", confirm: "Abcdef1!", nonce: "123456" }),
    );
    expect(m.updateUser).toHaveBeenLastCalledWith({ password: "Abcdef1!", nonce: "123456" });
    expect(second.success).toBeDefined();
  });

  it("sem sessão não altera nada", async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const r = await setPasswordAction({}, fd({ password: "Abcdef1!", confirm: "Abcdef1!" }));
    expect(r.error).toMatch(/sessão/);
    expect(m.updateUser).not.toHaveBeenCalled();
  });
});

describe("Esqueci minha senha", () => {
  it("envia link que volta pelo callback para /redefinir-senha, com resposta neutra", async () => {
    m.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const r = await requestPasswordResetAction({}, fd({ email: "ana@gmail.com" }));
    expect(m.resetPasswordForEmail).toHaveBeenCalledWith("ana@gmail.com", {
      redirectTo: "http://localhost:3100/auth/callback?next=%2Fredefinir-senha",
    });
    expect(r.notice).toMatch(/Se houver uma conta/);
  });

  it("rejeita e-mail inválido", async () => {
    const r = await requestPasswordResetAction({}, fd({ email: "x" }));
    expect(r.error).toBeDefined();
    expect(m.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
