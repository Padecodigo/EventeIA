import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Variáveis lidas só em scripts/dev ou de propósito ausentes em produção.
const PROD_EXCLUDED = new Set([
  "NODE_ENV", "DEMO_ADMIN_PASSWORD", "DEMO_ANA_PASSWORD", "DEMO_LOGIN_SECRET",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("docker-compose.prod.yml", () => {
  const compose = readFileSync("docker-compose.prod.yml", "utf8");

  it("repassa ao app/worker toda env lida pelo código de runtime", () => {
    const files = [...walk("app"), ...walk("lib"), ...walk("workers"), "middleware.ts"];
    const used = new Set<string>();
    for (const f of files)
      for (const m of readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]);
    const missing = [...used].filter(
      (v) => !PROD_EXCLUDED.has(v) && !new RegExp(`^\\s+${v}:`, "m").test(compose),
    );
    expect(missing).toEqual([]);
  });

  it("nunca habilita login demo em produção", () => {
    expect(compose).toMatch(/DEMO_LOGIN_ENABLED: "false"/);
  });

  it("não publica portas de serviços internos", () => {
    expect(compose).not.toMatch(/^\s+ports:/m);
  });

  it("mantém a Evolution (WhatsApp) desligada por padrão via profile", () => {
    for (const svc of ["evolution-db", "evolution-api"]) {
      const block = compose.split(new RegExp(`^  ${svc}:$`, "m"))[1]?.split(/^  [a-z-]+:$/m)[0] ?? "";
      expect(block).toMatch(/profiles: \["whatsapp"\]/);
    }
  });

  it("app e worker não dependem da Evolution para subir", () => {
    expect(compose).not.toMatch(/depends_on:[\s\S]{0,120}evolution-api/);
  });
});
