import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI hygiene (ci.yml + package.json)", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    devDependencies: Record<string, string>;
  };

  it("pinna a Supabase CLI em versão semver (nunca 'latest')", () => {
    expect(ci).not.toMatch(/version:\s*latest/);
    expect(ci).toMatch(/supabase\/setup-cli@v1[\s\S]*?version:\s*\d+\.\d+\.\d+/);
  });

  it("detecta drift de tipos do banco com git diff --exit-code", () => {
    expect(ci).toContain("git diff --exit-code lib/supabase/database.types.ts");
  });

  it("alinha as majors de vitest e @vitest/coverage-v8", () => {
    const major = (spec: string): string => spec.replace(/^\^/, "").split(".")[0];
    const vitest = major(pkg.devDependencies.vitest);
    const coverage = major(pkg.devDependencies["@vitest/coverage-v8"]);
    expect(vitest).toBe(coverage);
    expect(vitest).toBe("4");
  });
});
