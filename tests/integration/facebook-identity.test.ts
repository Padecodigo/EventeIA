import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, linkIdentity, unlinkIdentity, cookieSet, redirect, revalidatePath } = vi.hoisted(
  () => ({
    getUser: vi.fn(),
    linkIdentity: vi.fn(),
    unlinkIdentity: vi.fn(),
    cookieSet: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers({ host: "localhost:3100", "x-forwarded-proto": "http" })),
  cookies: () => Promise.resolve({ set: cookieSet }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ auth: { getUser, linkIdentity, unlinkIdentity } }),
}));
vi.mock("@/lib/auth/password-server", () => ({
  accountHasPassword: (user: { app_metadata?: { has_password?: boolean } } | null) =>
    Promise.resolve(user?.app_metadata?.has_password === true),
}));

import { UNLINK_LAST_IDENTITY_ERROR } from "@/lib/auth/identities";
import {
  linkFacebookAction,
  unlinkFacebookAction,
} from "@/app/(dashboard)/perfil/identity-actions";

const facebookOnly = {
  id: "u1",
  email: "ana@eventeia.com",
  identities: [{ id: "id-fb", provider: "facebook" }],
  app_metadata: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.APP_URL;
  delete process.env.SITE_URL;
});

describe("linkFacebookAction", () => {
  it("com a flag desligada não chama linkIdentity", async () => {
    await expect(linkFacebookAction()).resolves.toEqual({
      error: "A conexão com o Facebook não está disponível no momento.",
    });
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("inicia o vínculo e grava o cookie de retorno ao perfil", async () => {
    process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED = "true";
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          identities: [{ provider: "google" }],
          app_metadata: {},
        },
      },
      error: null,
    });
    linkIdentity.mockResolvedValue({
      data: { url: "https://www.facebook.com/dialog/oauth?link=1" },
      error: null,
    });

    await expect(linkFacebookAction()).rejects.toThrow(
      "REDIRECT:https://www.facebook.com/dialog/oauth?link=1",
    );
    expect(linkIdentity).toHaveBeenCalledWith({
      provider: "facebook",
      options: {
        redirectTo: "http://localhost:3100/auth/callback",
        scopes: "public_profile,email",
      },
    });
    expect(cookieSet).toHaveBeenCalledWith(
      "eventeia_auth_next",
      "/perfil",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/auth/callback" }),
    );
  });
});

describe("unlinkFacebookAction", () => {
  it("recusa desconectar a última identidade de conta sem senha", async () => {
    process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED = "true";
    getUser.mockResolvedValue({ data: { user: facebookOnly }, error: null });

    await expect(unlinkFacebookAction()).resolves.toEqual({
      error: UNLINK_LAST_IDENTITY_ERROR,
    });
    expect(unlinkIdentity).not.toHaveBeenCalled();
  });

  it("permite desconectar quando a conta tem senha", async () => {
    process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED = "true";
    getUser.mockResolvedValue({
      data: {
        user: { ...facebookOnly, app_metadata: { has_password: true } },
      },
      error: null,
    });
    unlinkIdentity.mockResolvedValue({ error: null });

    await expect(unlinkFacebookAction()).resolves.toEqual({
      notice: "Facebook desconectado.",
    });
    expect(unlinkIdentity).toHaveBeenCalledWith(facebookOnly.identities[0]);
    expect(revalidatePath).toHaveBeenCalledWith("/perfil");
  });

  it("permite desconectar quando resta outra identidade, mesmo sem senha", async () => {
    process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED = "true";
    const identities = [
      { id: "id-fb", provider: "facebook" },
      { id: "id-g", provider: "google" },
    ];
    getUser.mockResolvedValue({
      data: { user: { id: "u1", identities, app_metadata: {} } },
      error: null,
    });
    unlinkIdentity.mockResolvedValue({ error: null });

    await expect(unlinkFacebookAction()).resolves.toEqual({
      notice: "Facebook desconectado.",
    });
    expect(unlinkIdentity).toHaveBeenCalledWith(identities[0]);
  });
});
