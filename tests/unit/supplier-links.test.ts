import { describe, expect, it } from "vitest";

import { supplierDmUrls, supplierRef } from "@/lib/outreach/supplier-links";

describe("supplierRef", () => {
  it("codifica evento quando há contexto", () => {
    expect(supplierRef("aaaaaaaa-0000-4000-8000-000000000001")).toBe(
      "event:aaaaaaaa-0000-4000-8000-000000000001",
    );
  });

  it("default é fornecedor sem contexto", () => {
    expect(supplierRef()).toBe("fornecedor");
    expect(supplierRef("")).toBe("fornecedor");
    expect(supplierRef(null)).toBe("fornecedor");
  });
});

describe("supplierDmUrls", () => {
  it("gera links ig.me e m.me com o ref codificado", () => {
    const ref = "event:aaaaaaaa-0000-4000-8000-000000000001";
    const links = supplierDmUrls(ref);
    expect(links.instagram).toContain("https://ig.me/m/eventeia?ref=");
    expect(links.messenger).toContain("https://m.me/eventeia?ref=");
    expect(links.instagram).toContain(encodeURIComponent(ref));
    expect(links.messenger).toContain(encodeURIComponent(ref));
  });
});
