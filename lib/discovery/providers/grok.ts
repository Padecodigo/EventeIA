import { z } from "zod";

import type { SupplierCandidate } from "../pure";
import {
  ProviderQuotaError,
  queryWhat,
  type DiscoveryProvider,
  type DiscoveryQuery,
  type FetchLike,
} from "./types";

/**
 * Provedor Grok (xAI Responses API) com busca ao vivo na web e no X.
 * Nunca inventa números: o prompt exige source_url real; a validação de telefone
 * (DDD, formato) acontece depois, fora do modelo.
 */
export const XAI_BASE_URL = "https://api.x.ai/v1";
export const XAI_DEFAULT_MODEL = "grok-4.7";

const grokSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).nullable().optional(),
  source_url: z.string().trim().url().max(500),
  website_url: z.string().trim().url().max(500).nullable().optional(),
});
const grokPayloadSchema = z.object({ suppliers: z.array(grokSupplierSchema).max(30) });

const responseSchema = z.object({
  output_text: z.string().optional(),
  output: z
    .array(
      z.object({
        type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      }),
    )
    .optional(),
});

/** "Taubaté (SP, Brasil)" — nunca assume SP: usa a UF do município ou só "Brasil". */
export function cityLabel(q: Pick<DiscoveryQuery, "city" | "uf">): string {
  return q.uf !== undefined && /^[A-Z]{2}$/.test(q.uf)
    ? `${q.city} (${q.uf}, Brasil)`
    : `${q.city} (Brasil)`;
}

export function buildGrokPrompt(q: DiscoveryQuery): string {
  const what = queryWhat(q);
  return [
    `Encontre até ${String(q.limit)} fornecedores REAIS de "${what}" que atendem a cidade de ${cityLabel(q)},`,
    `para um evento do tipo ${q.eventTypeLabel}. Use busca na web e no X (perfis públicos de empresas, sites, Google Maps, Instagram públicos via resultados de busca).`,
    `Regras: somente empresas/profissionais com contato comercial PÚBLICO; nunca invente telefones;`,
    `inclua apenas telefones que aparecem literalmente na fonte; source_url deve ser a página onde o contato aparece.`,
    q.exclude.length > 0
      ? `Ignore estes contatos já conhecidos: ${q.exclude.slice(0, 40).join(", ")}.`
      : "",
    `Responda SOMENTE com JSON: {"suppliers":[{"name":"","phone":"","source_url":"","website_url":""}]}.`,
  ]
    .filter((l) => l.length > 0)
    .join(" ");
}

export function extractJsonBlock(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

export function parseGrokResponse(body: unknown, query: DiscoveryQuery): SupplierCandidate[] {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return [];
  const text =
    parsed.data.output_text ??
    (parsed.data.output ?? [])
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("\n");
  const payload = grokPayloadSchema.safeParse(extractJsonBlock(text));
  if (!payload.success) return [];
  return payload.data.suppliers.map((s) => ({
    name: s.name,
    category: query.category,
    phone: s.phone ?? undefined,
    sourceUrl: s.source_url,
    websiteUrl: s.website_url ?? undefined,
    city: query.city,
  }));
}

export function createGrokProvider(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: FetchLike;
}): DiscoveryProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    name: "grok",
    async search(query: DiscoveryQuery): Promise<SupplierCandidate[]> {
      const res = await fetchImpl(`${XAI_BASE_URL}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model: options.model ?? XAI_DEFAULT_MODEL,
          input: [{ role: "user", content: buildGrokPrompt(query) }],
          tools: [{ type: "web_search" }, { type: "x_search" }],
          temperature: 0,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        if (res.status === 429 || res.status === 402 || res.status === 403)
          throw new ProviderQuotaError("grok", res.status);
        throw new Error(`xAI HTTP ${String(res.status)}`);
      }
      return parseGrokResponse(await res.json(), query);
    },
  };
}
