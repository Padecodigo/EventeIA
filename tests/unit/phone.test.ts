import { describe, expect, it } from "vitest";

import { normalizePhoneE164 } from "@/lib/phone";

describe("telefone", () => {
  it("normaliza números brasileiros para E.164", () => {
    expect(normalizePhoneE164("(11) 99999-9999")).toBe("+5511999999999");
    expect(normalizePhoneE164("11 3333-4444")).toBe("+551133334444");
    expect(normalizePhoneE164("+55 11 98888-7777")).toBe("+5511988887777");
    expect(normalizePhoneE164("5511988887777")).toBe("+5511988887777");
  });

  it("recusa inválidos", () => {
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164("1234")).toBeNull();
    expect(normalizePhoneE164("+1 202 555 0147")).toBeNull();
  });
});
