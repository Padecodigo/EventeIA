import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("/planos public copy", () => {
  it("does not leak internal docs paths", () => {
    const src = readFileSync("app/(marketing)/planos/page.tsx", "utf8");
    expect(src).not.toMatch(/\.context\//);
  });
});
