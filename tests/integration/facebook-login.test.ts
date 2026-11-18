import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithOAuth, redirect } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers({ host: "localhost:3100", "x-forwarded-proto": "http" })),
  cookies: () =>
    Promise.resolve({
      set: vi.fn(),
    }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { signInWithOAuth } }),
}));

import { signInWithFacebookAction } from "@/app/(auth)/actions";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.APP_URL;
  delete process.env.SITE_URL;
});

describe("signInWithFacebookAction", () => {
  it("com a flag desligada não chama o OAuth", async () => {
    await expect(signInWithFacebookAction()).resolves.toEqual({
      error: "O login com Facebook não está disponível no momento.",
    });
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("com a flag ligada pede provider facebook e redireciona", async () => {
    process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED = "true";
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://www.facebook.com/dialog/oauth" },
      error: null,
    });

    await expect(signInWithFacebookAction()).rejects.toThrow(
      "REDIRECT:https://www.facebook.com/dialog/oauth",
    );
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "facebook",
      options: {
        redirectTo: "http://localhost:3100/auth/callback",
        scopes: "public_profile,email",
      },
    });
  });

  it("no cadastro exige o aceite dos termos e não inicia o OAuth", async () => {
    process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED = "true";
    const form = new FormData();
    form.set("intent", "signup");
    await expect(signInWithFacebookAction({}, form)).resolves.toMatchObject({
      error: expect.stringMatching(/termos/i),
    });
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("devolve erro amigável quando o provider falha", async () => {
    process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED = "true";
    signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "provider disabled" },
    });
    await expect(signInWithFacebookAction()).resolves.toEqual({
      error: "Não foi possível iniciar o login com Facebook. Tente novamente.",
    });
  });
});
