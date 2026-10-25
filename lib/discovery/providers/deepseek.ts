import { z } from "zod";

import { parseBrazilPhone } from "@/lib/phone";

import type { SupplierCandidate } from "../pure";
import { cityLabel, extractJsonBlock } from "./grok";
import { ProviderQuotaError, type DiscoveryProvider, type DiscoveryQuery, type FetchLike } from "./types";

/**
 * Pós-processamento DeepSeek sobre fontes reais (OpenStreetMap). O modelo NÃO busca nem
 * inventa contatos: só escolhe índices relevantes, classifica e limpa o nome comercial.
 * Telefone/source_url vêm sempre do candidato original e são revalidados aqui (celular BR,
 * apto a WhatsApp). Mantém o `name` da fonte (ex.: "overpass") para rótulo e limites.
 */
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_DISCOVERY_MODEL = "deepseek-flash";

const payloadSchema = z.object({
  keep: z
    .array(
      z.object({
        i: z.number().int().min(0),
        name: z.string().trim().min(2).max(120).optional(),
        relevant: z.boolean().optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .max(80),
});
const chatSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable().optional() }) })).min(1),
});

export function buildDeepseekPrompt(q: DiscoveryQuery, raw: readonly SupplierCandidate[]): string {
  const list = raw
    .map((c, i) => `${String(i)}. ${c.name}${c.hint !== undefined ? ` [${c.hint}]` : ""}${c.websiteUrl !== undefined ? ` (${c.websiteUrl})` : ""}`)
    .join("\n");
  const what = q.category === "outros" && q.freeText !== undefined ? q.freeText : q.categoryLabel;
  return [
    `Lista de estabelecimentos reais do OpenStreetMap em ${cityLabel(q)}.`,
    `Selecione SOMENTE os que provavelmente prestam o serviço "${what}" para festas/eventos (${q.eventTypeLabel}).`,
    `Exclua: órgãos públicos, escolas, igrejas, supermercados/redes genéricas, bancos e o que não tiver relação com "${what}".`,
    `Normalize o nome comercial (sem CNPJ, sem "LTDA"/"ME", capitalização correta). Não invente nada; use só os índices.`,
    `Responda SOMENTE JSON: {"keep":[{"i":0,"name":"Nome","relevant":true,"confidence":0.8}]}`,
    list,
  ].join("\n");
}

export function applyDeepseekSelection(content: string, raw: readonly SupplierCandidate[], limit: number): SupplierCandidate[] {
  const parsed = payloadSchema.safeParse(extractJsonBlock(content));
  if (!parsed.success) return [];
  const out: SupplierCandidate[] = [];
  const seen = new Set<number>();
  for (const k of parsed.data.keep) {
    if (k.relevant === false || (k.confidence !== undefined && k.confidence < 0.5)) continue;
    const base = raw[k.i];
    if (base === undefined || seen.has(k.i)) continue;
    seen.add(k.i);
    const phone = base.phone !== undefined ? parseBrazilPhone(base.phone) : null;
    if (phone === null || !phone.mobile) continue; // só celular (WhatsApp)
    const { hint: _hint, ...rest } = base;
    out.push({ ...rest, phone: phone.e164, name: k.name ?? base.name });
    if (out.length >= limit) break;
  }
  return out;
}

export function createDeepseekRefinedProvider(options: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  source: DiscoveryProvider;
  fetchImpl?: FetchLike;
}): DiscoveryProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? DEEPSEEK_BASE_URL).replace(/\/+$/, "");
  return {
    name: options.source.name,
    async search(query: DiscoveryQuery): Promise<SupplierCandidate[]> {
      const raw = (await options.source.search({ ...query, limit: Math.max(query.limit * 4, 20) }))
        .filter((c) => c.phone === undefined || !query.exclude.includes(c.phone))
        .slice(0, 60);
      if (raw.length === 0) return [];
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model: options.model ?? DEEPSEEK_DISCOVERY_MODEL,
          messages: [{ role: "user", content: buildDeepseekPrompt(query, raw) }],
          temperature: 0,
          max_tokens: 2000,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        if (res.status === 429 || res.status === 402) throw new ProviderQuotaError("deepseek", res.status);
        throw new Error(`DeepSeek HTTP ${String(res.status)}`);
      }
      const body = chatSchema.safeParse(await res.json());
      if (!body.success) return [];
      return applyDeepseekSelection(body.data.choices[0]?.message.content ?? "", raw, query.limit);
    },
  };
}
