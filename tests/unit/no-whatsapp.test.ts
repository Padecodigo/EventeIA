import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OUTREACH_CHANNELS } from "@/lib/prospecting/inbound";

/**
 * Regressão: WhatsApp e Evolution foram removidos como canal do produto.
 * O banco mantém as tabelas/colunas legadas (whatsapp_messages, whatsapp_channel,
 * whatsapp_verified…), mas nenhum código de app/lib/workers/components pode mais
 * importar módulos whatsapp/evolution nem referenciar env EVOLUTION_/WHATSAPP_.
 */

const SOURCE_ROOTS = ["app", "lib", "workers", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const root of SOURCE_ROOTS) {
    if (!statSync(root).isDirectory()) continue;
    walk(root, out);
  }
  return out;
}

/** Especificadores de módulo de import/require estáticos e dinâmicos. */
function importSpecifiers(src: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bimport\s*\(?\s*["']([^"']+)["']\s*\)?/g,
    /\bfrom\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) out.push(m[1] ?? "");
  }
  return out;
}

describe("remoção do WhatsApp/Evolution", () => {
  it("nenhum arquivo de app/lib/workers/components importa módulos whatsapp/evolution", () => {
    const bad: string[] = [];
    for (const file of sourceFiles()) {
      for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
        if (/whatsapp|evolution/i.test(spec)) bad.push(`${file} → ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("nenhum arquivo referencia variáveis de ambiente EVOLUTION_/WHATSAPP_", () => {
    const bad: string[] = [];
    for (const file of sourceFiles()) {
      const src = readFileSync(file, "utf8");
      if (/\bEVOLUTION_[A-Z0-9_]*\b/.test(src)) bad.push(`${file} → EVOLUTION_*`);
      if (/process\.env\.WHATSAPP_[A-Z0-9_]*/.test(src)) bad.push(`${file} → WHATSAPP_*`);
    }
    expect(bad).toEqual([]);
  });

  it("lib/env.ts não tem chaves EVOLUTION_/WHATSAPP_", () => {
    const src = readFileSync("lib/env.ts", "utf8");
    expect(src).not.toMatch(/\b(EVOLUTION|WHATSAPP)_[A-Z0-9_]*\b/);
  });

  it("docker-compose não mantém o serviço evolution", () => {
    for (const file of ["docker-compose.dev.yml", "docker-compose.prod.yml"]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/^\s{2}evolution(-api|-db)?:/m);
    }
  });

  it("a lista de canais de contato exclui whatsapp", () => {
    expect([...OUTREACH_CHANNELS]).not.toContain("whatsapp");
    expect([...OUTREACH_CHANNELS]).toEqual(["instagram", "messenger"]);
  });
});
