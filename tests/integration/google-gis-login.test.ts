import { beforeEach, describe, expect, it, vi } from "vitest";

/** Integração: ID token do Google (GIS) → Supabase signInWithIdToken → sessão + pós-login. */

const { signInWithIdToken, bindWelcomeOfferToUser, recordTermsAcceptance, cookieSet } = vi.hoisted(
  () => ({
    signInWithIdToken: vi.fn(),
    bindWelcomeOfferToUser: vi.fn(() => Promise.resolve()),
    recordTermsAcceptance: vi.fn(() => Promise.resolve()),
    cookieSet: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/welcome/server", () => ({ bindWelcomeOfferToUser }));
vi.mock("@/lib/legal/acceptance-server", () => ({ recordTermsAcceptance }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers({ host: "eventeia.com.br", "x-forwarded-proto": "https" })),
  cookies: () => Promise.resolve({ set: cookieSet, get: vi.fn(), delete: vi.fn() }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { signInWithIdToken } }),
}));

import { signInWithGoogleIdTokenAction } from "@/app/(auth)/actions";

const NONCE = "a".repeat(64);
const TOKEN = "eyJhbGciOiJSUzI1NiJ9.payload.signature";

beforeEach(() => vi.clearAllMocks());

describe("signInWithGoogleIdTokenAction", () => {
  it("troca o ID token por sessão com o nonce cru e vai para o painel", async () => {
    signInWithIdToken.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    await expect(
      signInWithGoogleIdTokenAction({
        credential: TOKEN,
        nonce: NONCE,
        intent: "signin",
        acceptedTerms: false,
      }),
    ).resolves.toEqual({ redirectTo: "/painel" });
    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: TOKEN,
      nonce: NONCE,
    });
    expect(bindWelcomeOfferToUser).toHaveBeenCalledWith("u1");
    expect(recordTermsAcceptance).not.toHaveBeenCalled();
    expect(cookieSet).toHaveBeenCalledTimes(1);
  });

  it("cadastro registra o aceite dos termos", async () => {
    signInWithIdToken.mockResolvedValue({ data: { user: { id: "u2" } }, error: null });
    await signInWithGoogleIdTokenAction({
      credential: TOKEN,
      nonce: NONCE,
      intent: "signup",
      acceptedTerms: true,
    });
    expect(recordTermsAcceptance).toHaveBeenCalledWith("u2", "signup");
  });

  it("cadastro sem aceite não chama o Supabase", async () => {
    const r = await signInWithGoogleIdTokenAction({
      credential: TOKEN,
      nonce: NONCE,
      intent: "signup",
      acceptedTerms: false,
    });
    expect(r.error).toBeDefined();
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("rejeita nonce malformado e erro do Supabase com mensagem amigável", async () => {
    const bad = await signInWithGoogleIdTokenAction({
      credential: TOKEN,
      nonce: "x",
      intent: "signin",
      acceptedTerms: false,
    });
    expect(bad.error).toMatch(/Google/);
    signInWithIdToken.mockResolvedValue({
      data: { user: null },
      error: { message: "nonce mismatch" },
    });
    const r = await signInWithGoogleIdTokenAction({
      credential: TOKEN,
      nonce: NONCE,
      intent: "signin",
      acceptedTerms: false,
    });
    expect(r).toEqual({ error: "Não foi possível entrar com Google. Tente novamente." });
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
