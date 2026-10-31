import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("regressão: header sticky não cobre o conteúdo do evento", () => {
  it("o header do dashboard é sticky e as páginas do evento usam scroll-mt", () => {
    expect(read("app/(dashboard)/layout.tsx")).toContain("sticky top-0");
    expect(read("app/(dashboard)/eventos/[id]/page.tsx")).toMatch(/scroll-mt-24/);
    expect(read("app/(dashboard)/eventos/[id]/entrevista/page.tsx")).toMatch(/scroll-mt-24/);
  });

  it("as seções da página do evento mantêm o offset do header", () => {
    const page = read("app/(dashboard)/eventos/[id]/page.tsx");
    expect(page).toContain('id="evento-topo"');
    expect(page).toMatch(/className="scroll-mt-24/);
  });
});
