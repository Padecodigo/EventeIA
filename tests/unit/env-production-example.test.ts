import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Extrai nomes de variáveis (inclui as comentadas "# NOME=" como documentadas). */
function keys(file: string): Set<string> {
  const text = readFileSync(join(process.cwd(), file), "utf8");
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    const m = /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line.trim());
    if (m?.[1]) out.add(m[1]);
  }
  return out;
}

function duplicates(file: string): string[] {
  const text = readFileSync(join(process.cwd(), file), "utf8");
  const seen = new Map<string, number>();
  for (const line of text.split("\n")) {
    const m = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (m?.[1]) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}

describe(".env.production.example", () => {
  it("documenta todas as variáveis do .env.example (exceto demo)", () => {
    const prod = keys(".env.production.example");
    const missing = [...keys(".env.example")].filter(
      (k) => !k.startsWith("DEMO_") && !prod.has(k),
    );
    expect(missing).toEqual([]);
  });

  it("não repete variáveis ativas", () => {
    expect(duplicates(".env.production.example")).toEqual([]);
  });

  it("inclui os nomes reais do roteador de IA e do financeiro", () => {
    const prod = keys(".env.production.example");
    for (const k of [
      "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "DEEPSEEK_BASE_URL", "DEEPSEEK_MOCK",
      "AI_USE_DEEPSEEK", "XAI_API_KEY", "XAI_MODEL", "XAI_USAGE_SWITCH_PCT",
      "NVIDIA_NIM_API_KEY", "NIM_MODEL", "AI_GROK_BOOTSTRAP_MICROUSD",
      "FINANCE_PRICES_JSON", "FINANCE_FX_BRL_PER_USD_MICRO",
    ]) {
      expect(prod.has(k), k).toBe(true);
    }
  });
});
