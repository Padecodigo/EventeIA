import { describe, expect, it } from "vitest";

import { isSameOrigin } from "@/lib/http/same-origin";

const base = { host: "app:3000", forwardedHost: "eventeia.com.br", appUrl: "https://eventeia.com.br" };

describe("isSameOrigin atrás do proxy", () => {
  it("aceita o próprio site mesmo com host interno do container", () => {
    expect(isSameOrigin({ ...base, origin: "https://eventeia.com.br" })).toBe(true);
    expect(isSameOrigin({ ...base, forwardedHost: null, origin: "https://eventeia.com.br" })).toBe(true);
  });
  it("sem Origin: aceita", () => {
    expect(isSameOrigin({ ...base, origin: null })).toBe(true);
  });
  it("recusa outra origem e Origin inválida", () => {
    expect(isSameOrigin({ ...base, origin: "https://evil.example" })).toBe(false);
    expect(isSameOrigin({ ...base, origin: "https://eventeia.com.br.evil.example" })).toBe(false);
    expect(isSameOrigin({ ...base, origin: "null" })).toBe(false);
  });
});
