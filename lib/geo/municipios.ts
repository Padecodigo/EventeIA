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


/** Teto de cidades de busca por evento (inclui a do evento) — igual ao CHECK da migração 0033. */
export const MAX_SEARCH_CITIES = 10;

/**
 * Valida a lista de cidades extras vinda do formulário ("3554102,3524402"):
 * só códigos IBGE existentes, sem repetir, sem a cidade do evento, até MAX_SEARCH_CITIES-1.
 * Entradas inválidas são descartadas (nunca texto livre).
 */
export function parseSearchCityCodes(raw: string | null | undefined, eventCode: number): number[] {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) return [];
  const out: number[] = [];
  for (const part of raw.split(",")) {
    if (!/^\d{7}$/.test(part.trim())) continue;
    const code = Number(part.trim());
    if (code === eventCode || out.includes(code) || findMunicipioByCode(code) === null) continue;
    out.push(code);
    if (out.length >= MAX_SEARCH_CITIES - 1) break;
  }
  return out;
}

/** Eventos legados (só `city` em texto): acha o município de mesmo nome, preferindo a UF dada (ou SP). */
export function resolveMunicipio(input: { code?: number | null; name?: string | null; uf?: string | null }): Municipio | null {
  if (typeof input.code === "number") {
    const byId = findMunicipioByCode(input.code);
    if (byId !== null) return byId;
  }
  const name = (input.name ?? "").trim();
  if (name.length < 2) return null;
  const key = normalizeText(name);
  const exact = all().filter((m) => m.key === key);
  const pick = exact.find((m) => m.uf === (input.uf ?? "SP")) ?? exact.find((m) => m.uf === "SP") ?? exact[0];
  return pick === undefined ? null : { code: pick.code, name: pick.name, uf: pick.uf };
}
