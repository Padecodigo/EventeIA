import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Regressão (QA 25/10/2026): "/para-planners" em <code> quebrava em duas linhas no subtítulo do admin.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("admin sem chips <code> em textos corridos", () => {
  it("nenhuma página do admin usa <code> inline", () => {
    const offenders = [...files("app/admin"), ...files("components/admin")].filter((f) => /<code[\s>]/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
