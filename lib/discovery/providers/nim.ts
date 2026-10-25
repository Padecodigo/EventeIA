import { z } from "zod";

import type { SupplierCandidate } from "../pure";
import { cityLabel, extractJsonBlock } from "./grok";
import { ProviderQuotaError, type DiscoveryProvider, type DiscoveryQuery, type FetchLike } from "./types";

/**
 * Fallback NVIDIA NIM (OpenAI-compatível). LIMITAÇÃO: o NIM NÃO tem busca ao vivo.
 * Ele não encontra fornecedores: recebe candidatos brutos de fontes reais
 * (Overpass/OSM, páginas buscadas) e só filtra/classifica/limpa nomes.
 * Telefones e source_url vêm SEMPRE do candidato original (índice), nunca do modelo.
 */
export const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NIM_DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

const nimPayloadSchema = z.object({
  keep: z
    .array(z.object({ i: z.number().int().min(0), name: z.string().trim().min(2).max(120).optional() }))
    .max(60),
});
const chatSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable().optional() }) })).min(1),
});

export function buildNimPrompt(q: DiscoveryQuery, raw: readonly SupplierCandidate[]): string {
  const list = raw.map((c, i) => `${String(i)}. ${c.name}${c.websiteUrl !== undefined ? ` (${c.websiteUrl})` : ""}`).join("\n");
  const what = q.category === "outros" && q.freeText !== undefined ? q.freeText : q.categoryLabel;
  return [
    `Classifique quais destes estabelecimentos de ${cityLabel(q)} provavelmente oferecem "${what}" para um evento (${q.eventTypeLabel}).`,
    `Não invente nada; use apenas os índices da lista. Limpe o nome comercial se necessário.`,
    `Responda SOMENTE JSON: {"keep":[{"i":0,"name":"Nome"}]}`,
    list,
  ].join("\n");
}

/** Aplica a resposta do modelo sobre os candidatos (só índices válidos ⇒ zero alucinação de contato). */
export function applyNimSelection(content: string, raw: readonly SupplierCandidate[], limit: number): SupplierCandidate[] {
  const parsed = nimPayloadSchema.safeParse(extractJsonBlock(content));
  if (!parsed.success) return [];
  const out: SupplierCandidate[] = [];
  const seen = new Set<number>();
  for (const k of parsed.data.keep) {
    const base = raw[k.i];
    if (base === undefined || seen.has(k.i)) continue;
    seen.add(k.i);
    out.push({ ...base, name: k.name ?? base.name });
    if (out.length >= limit) break;
  }
  return out;
}

export function createNimProvider(options: {
  apiKey: string;
  model?: string;
  /** Fontes reais de candidatos (Overpass, cache, páginas). */
  sources: readonly DiscoveryProvider[];
  fetchImpl?: FetchLike;
}): DiscoveryProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    name: "nim",
    async search(query: DiscoveryQuery): Promise<SupplierCandidate[]> {
      const raw: SupplierCandidate[] = [];
      for (const source of options.sources) {
        try {
          raw.push(...(await source.search({ ...query, limit: Math.max(query.limit * 4, 20) })));
        } catch {
          // fonte indisponível: segue com as demais
        }
      }
      const fresh = raw.filter((c) => c.phone === undefined || !query.exclude.includes(c.phone)).slice(0, 60);
      if (fresh.length === 0) return [];
      const res = await fetchImpl(`${NIM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model: options.model ?? NIM_DEFAULT_MODEL,
          messages: [{ role: "user", content: buildNimPrompt(query, fresh) }],
          temperature: 0,
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        if (res.status === 429 || res.status === 402) throw new ProviderQuotaError("nim", res.status);
        throw new Error(`NIM HTTP ${String(res.status)}`);
      }
      const body = chatSchema.safeParse(await res.json());
      if (!body.success) return [];
      return applyNimSelection(body.data.choices[0]?.message.content ?? "", fresh, query.limit);
    },
  };
}
