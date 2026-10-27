import { describe, expect, it } from "vitest";

import {
  instagramProfileUrl,
  resolveInstagramSupplier,
  resolveInstagramSupplierByHandle,
  type MetaSupplierLookup,
} from "@/lib/meta/resolve";

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

function fakeDb(match: { id: string; name: string; category: string } | null): MetaSupplierLookup {
  return {
    from: () => ({
      select: () => ({
        eq: (col, value) => ({
          maybeSingle: async () => {
            expect(col).toBe("source_url");
            return { data: match && value === instagramProfileUrl("buffet_da_ana") ? match : null };
          },
        }),
      }),
    }),
  };
}

describe("resolução de remetente do Instagram", () => {
  it("busca o username e casa com o fornecedor pelo source_url", async () => {
    const supplier = await resolveInstagramSupplier(
      fakeDb({ id: "s1", name: "Buffet da Ana", category: "buffet" }),
      "IGSID1",
      "tok",
      fakeFetch({ username: "Buffet_da_Ana" }),
    );
    expect(supplier).toEqual({ id: "s1", name: "Buffet da Ana", category: "buffet" });
  });

  it("retorna null quando não há match", async () => {
    const supplier = await resolveInstagramSupplier(
      fakeDb(null),
      "IGSID1",
      "tok",
      fakeFetch({ username: "outro_perfil" }),
    );
    expect(supplier).toBeNull();
  });

  it("retorna null quando a Graph API falha", async () => {
    const supplier = await resolveInstagramSupplier(
      fakeDb({ id: "s1", name: "X", category: "buffet" }),
      "IGSID1",
      "tok",
      fakeFetch({ error: "nope" }, false),
    );
    expect(supplier).toBeNull();
  });

  it("normaliza o @handle para minúsculas", () => {
    expect(instagramProfileUrl("BUFFET_DA_ANA")).toBe("https://www.instagram.com/BUFFET_DA_ANA");
  });
});


describe("resolução por @username (comentário)", () => {
  it("casa o handle do comentário com o fornecedor", async () => {
    const supplier = await resolveInstagramSupplierByHandle(
      fakeDb({ id: "s1", name: "Buffet da Ana", category: "buffet" }),
      "Buffet_da_Ana",
    );
    expect(supplier?.id).toBe("s1");
  });

  it("handle vazio devolve null sem consultar", async () => {
    expect(await resolveInstagramSupplierByHandle(fakeDb(null), "  ")).toBeNull();
  });
});
