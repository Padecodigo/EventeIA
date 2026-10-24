import { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integração do login com Google: action → Supabase OAuth → callback →
 * sessão → e-mail usado na notificação "orçamento pronto".
 */

const { exchangeCodeForSession, signInWithOAuth, redirect, bindWelcomeOfferToUser } = vi.hoisted(
  () => ({
    bindWelcomeOfferToUser: vi.fn(() => Promise.resolve()),
    exchangeCodeForSession: vi.fn(),
    signInWithOAuth: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/welcome/server", () => ({ bindWelcomeOfferToUser }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers({ host: "localhost:3100", "x-forwarded-proto": "http" })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ auth: { exchangeCodeForSession, signInWithOAuth } }),
}));

import { signInWithGoogleAction } from "@/app/(auth)/actions";
import { GET } from "@/app/auth/callback/route";
import { recordQuotationsReady, type NotificationDeps } from "@/lib/notifications/quotations-ready";

function req(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("signInWithGoogleAction", () => {
  it("pede provider google com callback na origem e redireciona ao Google", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2" },
      error: null,
    });

    await expect(signInWithGoogleAction()).rejects.toThrow(
      "REDIRECT:https://accounts.google.com/o/oauth2",
    );
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3100/auth/callback",
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("devolve erro amigável quando o provider falha", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "provider disabled" },
    });
    await expect(signInWithGoogleAction()).resolves.toEqual({
      error: "Não foi possível iniciar o login com Google. Tente novamente.",
    });
  });
});

describe("GET /auth/callback", () => {
  it("troca o code por sessão e vai ao painel", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "u1", email: "ana@gmail.com" } },
      error: null,
    });
    const res = await GET(req("http://localhost:3100/auth/callback?code=abc"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("http://localhost:3100/painel");
    expect(bindWelcomeOfferToUser).toHaveBeenCalledWith("u1");
  });

  it("respeita next interno e bloqueia externo", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const ok = await GET(req("http://localhost:3100/auth/callback?code=a&next=/creditos"));
    expect(ok.headers.get("location")).toBe("http://localhost:3100/creditos");
    const bad = await GET(req("http://localhost:3100/auth/callback?code=a&next=//mal.com"));
    expect(bad.headers.get("location")).toBe("http://localhost:3100/painel");
  });

  it("volta para /entrar com erro quando o usuário cancela ou o code é inválido", async () => {
    const cancel = await GET(req("http://localhost:3100/auth/callback?error=access_denied"));
    expect(cancel.headers.get("location")).toBe("http://localhost:3100/entrar?erro=access_denied");

    exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: "bad code" },
    });
    const bad = await GET(req("http://localhost:3100/auth/callback?code=x"));
    expect(bad.headers.get("location")).toBe("http://localhost:3100/entrar?erro=oauth");
    expect(bindWelcomeOfferToUser).not.toHaveBeenCalled();
  });
});

describe("orçamento pronto → e-mail do Google", () => {
  it("envia para o e-mail salvo no perfil do usuário Google", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const deps: NotificationDeps = {
      getOwnerContact: () =>
        Promise.resolve({
          profileId: "u1",
          email: "ana@gmail.com",
          displayName: "Ana Lima",
          eventTitle: "Casamento",
        }),

      insertNotification: () => Promise.resolve("n1"),
      markEmailSent: vi.fn().mockResolvedValue(undefined),
      email: { send } as never,
      warn: vi.fn(),
    };
    await expect(
      recordQuotationsReady(deps, { eventId: "e1", reason: "collection_complete" }),
    ).resolves.toBe("created");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@gmail.com" }));
    expect(deps.markEmailSent).toHaveBeenCalledWith("n1");
  });
});
