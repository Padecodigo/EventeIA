import { describe, expect, it } from "vitest";

import { sessionCookieOptions } from "@/lib/supabase/session-cookies";

describe("cookie de sessão do Supabase", () => {
  it("remove maxAge e expires para o cookie morrer ao fechar o navegador", () => {
    const out = sessionCookieOptions({
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: 400 * 24 * 60 * 60,
      expires: new Date("2030-01-01T00:00:00Z"),
    });

    expect(out.maxAge).toBeUndefined();
    expect(out.expires).toBeUndefined();
    // O resto da configuração do SDK continua valendo.
    expect(out.path).toBe("/");
    expect(out.sameSite).toBe("lax");
  });

  it("preserva deleções (maxAge 0), senão o signOut não limpa o cookie", () => {
    const deletion = { path: "/", maxAge: 0 };
    expect(sessionCookieOptions(deletion)).toBe(deletion);
  });

  it("não quebra sem opções", () => {
    expect(sessionCookieOptions(undefined).maxAge).toBeUndefined();
  });
});
