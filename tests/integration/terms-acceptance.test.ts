import { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, fakeClient, type FakeDb } from "./helpers/fake-supabase";

/**
 * Aceite dos termos validado no servidor e registrado (data/hora + versão):
 * cadastro por e-mail, cadastro com Google (cookie → callback) e checkout.
 */
let db: FakeDb;
const { signUp, signInWithOAuth, exchangeCodeForSession, cookieSet, redirect } = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  cookieSet: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "user-1", email: "a@b.com" }) }));
vi.mock("@/lib/welcome/server", () => ({ bindWelcomeOfferToUser: async () => undefined }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => fakeClient(db) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    ...fakeClient(db),
    auth: { signUp, signInWithOAuth, exchangeCodeForSession },
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3100", "x-forwarded-proto": "http" }),
  cookies: async () => ({ set: cookieSet }),
}));

import { signInWithGoogleAction, signUpAction } from "@/app/(auth)/actions";
import { buyCreditsAction, subscribeToPlanAction } from "@/app/(dashboard)/creditos/actions";
import { GET } from "@/app/auth/callback/route";

function signUpForm(accept: boolean): FormData {
  const f = new FormData();
  f.set("fullName", "Ana Silva");
  f.set("email", "ana@teste.com");
  f.set("password", "senha-forte-123");
  if (accept) f.set("acceptTerms", "on");
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakeDb({ terms_acceptances: [], workspaces: [], profiles: [] });
});

describe("cadastro por e-mail", () => {
  it("sem aceite: recusa no servidor e não cria a conta", async () => {
    const state = await signUpAction({}, signUpForm(false));
    expect(state.error).toMatch(/Termos de Uso/);
    expect(signUp).not.toHaveBeenCalled();
    expect(db.tables.terms_acceptances).toHaveLength(0);
  });

  it("com aceite: cria a conta e registra versão + contexto", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "u-new" }, session: null }, error: null });
    const state = await signUpAction({}, signUpForm(true));
    expect(state.notice).toBeDefined();
    expect(db.tables.terms_acceptances?.[0]).toMatchObject({
      profile_id: "u-new",
      terms_version: "2026-10-25",
      context: "signup",
    });
  });
});

describe("cadastro com Google", () => {
  it("sem aceite: recusa antes de ir ao Google", async () => {
    const f = new FormData();
    f.set("intent", "signup");
    const state = await signInWithGoogleAction({}, f);
    expect(state.error).toMatch(/Termos de Uso/);
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("com aceite: grava o cookie do aceite e o callback registra", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/x" },
      error: null,
    });
    const f = new FormData();
    f.set("intent", "signup");
    f.set("acceptTerms", "on");
    await expect(signInWithGoogleAction({}, f)).rejects.toThrow(
      "REDIRECT:https://accounts.google.com/x",
    );
    expect(cookieSet).toHaveBeenCalledWith(
      "eventeia_terms_accept",
      "2026-10-25",
      expect.objectContaining({ httpOnly: true, path: "/auth/callback" }),
    );

    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "u-g" } }, error: null });
    const res = await GET(
      new NextRequest("http://localhost:3100/auth/callback?code=c", {
        headers: { cookie: "eventeia_terms_accept=2026-10-25" },
      }),
    );
    expect(res.headers.get("location")).toBe("http://localhost:3100/painel");
    expect(res.headers.get("set-cookie")).toMatch(/eventeia_terms_accept=;/);
    expect(db.tables.terms_acceptances?.[0]).toMatchObject({
      profile_id: "u-g",
      context: "signup",
    });
  });

  it("login (/entrar) com Google não exige aceite nem registra", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/x" },
      error: null,
    });
    await expect(signInWithGoogleAction()).rejects.toThrow("REDIRECT:");
    expect(cookieSet).not.toHaveBeenCalled();
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "u-g" } }, error: null });
    await GET(new NextRequest("http://localhost:3100/auth/callback?code=c"));
    expect(db.tables.terms_acceptances).toHaveLength(0);
  });
});

describe("checkout", () => {
  it("compra de créditos sem aceite é recusada sem cobrança", async () => {
    const f = new FormData();
    f.set("credits", "5");
    f.set("method", "pix");
    const state = await buyCreditsAction({}, f);
    expect(state.error).toMatch(/Termos de Uso/);
    expect(db.tables.terms_acceptances).toHaveLength(0);
  });

  it("franquia sem aceite é recusada", async () => {
    const f = new FormData();
    f.set("planCode", "essencial");
    f.set("renew", "yes");
    const state = await subscribeToPlanAction({}, f);
    expect(state.error).toMatch(/Termos de Uso/);
  });

  it("com aceite: registra o aceite do checkout", async () => {
    const f = new FormData();
    f.set("credits", "5");
    f.set("method", "pix");
    f.set("acceptTerms", "on");
    await buyCreditsAction({}, f);
    expect(db.tables.terms_acceptances?.[0]).toMatchObject({
      profile_id: "user-1",
      terms_version: "2026-10-25",
      context: "checkout",
    });
  });
});
