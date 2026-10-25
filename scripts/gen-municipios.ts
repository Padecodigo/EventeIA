/**
 * Gera o snapshot estático dos municípios brasileiros a partir da API pública do IBGE.
 * Uso: pnpm geo:municipios  →  lib/geo/municipios.json  ([codigoIbge, nome, uf][])
 * O app não chama o IBGE em runtime; rode de novo só quando o IBGE criar/renomear municípios.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

interface IbgeMunicipio {
  id: number;
  nome: string;
  microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } } | null;
  "regiao-imediata"?: { "regiao-intermediaria"?: { UF?: { sigla?: string } } } | null;
}

const URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";

async function main(): Promise<void> {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`IBGE respondeu ${String(res.status)}`);
  const list = (await res.json()) as IbgeMunicipio[];
  const rows = list
    .map((m) => {
      const uf = m.microrregiao?.mesorregiao?.UF?.sigla ?? m["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla;
      if (uf === undefined) throw new Error(`UF ausente para ${String(m.id)}`);
      return [m.id, m.nome, uf] as const;
    })
    .sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1], "pt-BR"));
  if (rows.length < 5500) throw new Error(`snapshot suspeito: ${String(rows.length)} municípios`);
  const out = join(process.cwd(), "lib/geo/municipios.json");
  writeFileSync(out, `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
  console.log(`${String(rows.length)} municípios → ${out}`);
}

void main();
