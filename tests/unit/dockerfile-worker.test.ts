import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regressão: o worker em produção entrava em crash loop porque o tsx rodava
// sem o tsconfig.workers.json (que mapeia `server-only` para um stub).
describe("Dockerfile.worker", () => {
  const text = readFileSync(join(process.cwd(), "Dockerfile.worker"), "utf8");

  it("roda o tsx com o tsconfig dos workers", () => {
    expect(text).toMatch(/^ENV TSX_TSCONFIG_PATH=tsconfig\.workers\.json$/m);
  });

  it("o tsconfig dos workers mapeia server-only para o stub", () => {
    const cfg = readFileSync(join(process.cwd(), "tsconfig.workers.json"), "utf8");
    expect(cfg).toContain("./workers/stubs/server-only.ts");
  });
});
