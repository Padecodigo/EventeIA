import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Regressão: builds Docker/Lighthouse falhavam baixando fontes do Google. Fontes são self-hosted. */
describe("fontes self-hosted", () => {
  it("nenhum import de next/font/google no código", () => {
    const out = execSync(
      "git grep -l -e 'next/font/google' -- 'app' 'components' 'lib' '*.ts' '*.tsx' ':!tests/unit/no-google-fonts.test.ts' || true",
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });

  it.each(["Fraunces", "Fraunces-Italic", "Figtree"])("arquivo %s.woff2 está versionado", (f) => {
    expect(existsSync(join(process.cwd(), "app/fonts", `${f}.woff2`))).toBe(true);
  });
});
