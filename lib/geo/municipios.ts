import type { RegionCode } from "@/lib/engine/types";

import raw from "./municipios.json";

/**
 * Municípios brasileiros (snapshot estático do IBGE — `pnpm geo:municipios`).
 * Sem dependência de rede em runtime; a busca roda no servidor (/api/municipios).
 */
export interface Municipio {
  code: number;
  name: string;
  uf: string;
}

type Row = [number, string, string];

/** Minúsculas, sem acento, espaços colapsados — "São José" ≡ "sao jose". */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Indexed extends Municipio {
  key: string;
}

let cache: Indexed[] | null = null;
let byCode: Map<number, Municipio> | null = null;

function all(): Indexed[] {
  if (cache === null) {
    cache = (raw as Row[]).map(([code, name, uf]) => ({ code, name, uf, key: normalizeText(name) }));
    byCode = new Map(cache.map((m) => [m.code, { code: m.code, name: m.name, uf: m.uf }]));
  }
  return cache;
}

export function municipioCount(): number {
  return all().length;
}

export function findMunicipioByCode(code: number): Municipio | null {
  all();
  return byCode?.get(code) ?? null;
}

/**
 * Busca por prefixo do nome (prioridade), depois início de palavra, depois substring.
 * Aceita "cidade, UF" / "cidade - UF" / "cidade/UF" para filtrar o estado.
 */
export function searchMunicipios(query: string, limit = 20): Municipio[] {
  let text = query;
  let uf: string | null = null;
  const m = /^(.*?)[\s,/-]+([A-Za-z]{2})\s*$/.exec(query.trim());
  if (m !== null && m[1] !== undefined && m[2] !== undefined && m[1].trim().length > 0) {
    const candidate = m[2].toUpperCase();
    if (all().some((x) => x.uf === candidate)) {
      text = m[1];
      uf = candidate;
    }
  }
  const q = normalizeText(text);
  if (q.length < 2) return [];
  const scored: { m: Indexed; s: number }[] = [];
  for (const item of all()) {
    if (uf !== null && item.uf !== uf) continue;
    let s = -1;
    if (item.key === q) s = 0;
    else if (item.key.startsWith(q)) s = 1;
    else if (item.key.includes(` ${q}`)) s = 2;
    else if (item.key.includes(q)) s = 3;
    if (s >= 0) scored.push({ m: item, s });
  }
  scored.sort((a, b) => a.s - b.s || a.m.key.length - b.m.key.length || a.m.key.localeCompare(b.m.key));
  return scored.slice(0, Math.max(1, Math.min(limit, 50))).map(({ m: x }) => ({ code: x.code, name: x.name, uf: x.uf }));
}

/**
 * Faixa de preço (engine v1) a partir da UF. A tabela regional do motor só
 * conhece sp/rj/mg/outros: mapeamos pelo estado; demais UFs → "outros" (fator neutro).
 */
export function regionForUf(uf: string): RegionCode {
  switch (uf.toUpperCase()) {
    case "SP":
      return "sp";
    case "RJ":
      return "rj";
    case "MG":
      return "mg";
    default:
      return "outros";
  }
}

