import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FILES = [
  "docker-compose.dev.yml",
  "scripts/seed-demo.ts",
  "README.md",
  "RELATORIO.md",
];

const HARDCODED = ["evolution-local", "EventeIA@2026", "Admin@2026"];

describe("sem senhas de desenvolvimento hardcoded", () => {
  it.each(FILES)("%s não contém senhas literais de desenvolvimento", (file) => {
    const text = readFileSync(join(process.cwd(), file), "utf8");
    for (const secret of HARDCODED) {
      expect(text, `${file} ainda contém "${secret}"`).not.toContain(secret);
    }
  });
});
