import { describe, expect, it } from "vitest";

import { publicOrigin, safeNextPath } from "@/lib/auth/oauth";

const h = (o: Record<string, string> = {}) => new Headers(o);
const BIND = "http://0.0.0.0:3000/auth/callback";

describe("publicOrigin", () => {
  it("prefere a env configurada", () => {
    expect(publicOrigin(h(), BIND, { NEXT_PUBLIC_APP_URL: "https://eventeia.com.br/" })).toBe("https://eventeia.com.br");
    expect(publicOrigin(h(), BIND, { APP_URL: "https://a.com", NEXT_PUBLIC_APP_URL: "https://b.com" })).toBe("https://a.com");
  });
  it("ignora env inválida ou apontando para bind host", () => {
    expect(publicOrigin(h({ "x-forwarded-host": "eventeia.com.br", "x-forwarded-proto": "https" }), BIND, { NEXT_PUBLIC_APP_URL: "http://0.0.0.0:3000" })).toBe("https://eventeia.com.br");
    expect(publicOrigin(h({ "x-forwarded-host": "eventeia.com.br", "x-forwarded-proto": "https" }), BIND, { APP_URL: "lixo" })).toBe("https://eventeia.com.br");
  });
  it("usa host quando não há forwarded, nunca 0.0.0.0", () => {
    expect(publicOrigin(h({ host: "localhost:3100" }), BIND, {})).toBe("http://localhost:3100");
    expect(publicOrigin(h({ host: "0.0.0.0:3000" }), "http://localhost:3000/x", {})).toBe("http://localhost:3000");
  });
  it("rejeita host forjado com caracteres inválidos", () => {
    expect(publicOrigin(h({ "x-forwarded-host": "evil.com/@x" }), "http://localhost:3000/x", {})).toBe("http://localhost:3000");
  });
});

describe("safeNextPath (open redirect)", () => {
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/a\r\nb"])("bloqueia %s", (n) => {
    expect(safeNextPath(n)).toBe("/painel");
  });
});
