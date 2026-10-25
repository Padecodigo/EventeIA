import { z } from "zod";

import type { SupplierCandidate } from "../pure";
import { cityLabel, extractJsonBlock, XAI_BASE_URL, XAI_DEFAULT_MODEL } from "./grok";
import { ProviderQuotaError, type DiscoveryProvider, type DiscoveryQuery, type FetchLike } from "./types";

/**
 * Provedor "social": perfis comerciais PÚBLICOS em Instagram, Facebook e TikTok,
 * encontrados via busca na web do Grok (xAI) — ex.: `site:instagram.com buffet Taubaté`.
 * Conformidade: nada de scraping, login ou automação nas redes; só o que aparece em
 * resultados públicos de busca (nome, @, link do perfil, telefone/WhatsApp da bio).
 * O link do perfil é validado aqui (domínio + formato); telefones seguem a validação
 * normal da descoberta (DDD/WhatsApp), nunca inventados pelo modelo.
 */
export const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

const PLATFORM_HOSTS: Record<SocialPlatform, RegExp> = {
  instagram: /^(www\.)?instagram\.com$/i,
  facebook: /^(www\.|m\.|pt-br\.)?facebook\.com$/i,
  tiktok: /^(www\.)?tiktok\.com$/i,
};
/** Caminhos que não são perfil (posts, buscas, login…) — descartados. */
const NON_PROFILE = /^\/(p|reel|reels|explore|stories|accounts|login|share|search|hashtag|tag|watch|groups|events|video)(\/|$)/i;

/** Normaliza a URL do perfil e extrai plataforma + @handle; null se não for um perfil público válido. */
export function parseSocialProfile(raw: string): { platform: SocialPlatform; handle: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const platform = SOCIAL_PLATFORMS.find((p) => PLATFORM_HOSTS[p].test(u.hostname));
  if (platform === undefined || NON_PROFILE.test(u.pathname)) return null;
  const first = u.pathname.split("/").filter((s) => s.length > 0)[0];
  if (first === undefined) return null;
  const handle = decodeURIComponent(first).replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{2,60}$/.test(handle) || handle === "profile.php") return null;
  const host = platform === "facebook" ? "www.facebook.com" : `www.${platform}.com`;
  const path = platform === "tiktok" ? `@${handle}` : handle;
  return { platform, handle: handle.toLowerCase(), url: `https://${host}/${path}` };
}

const socialSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  profile_url: z.string().trim().max(500),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp_link: z.string().trim().max(300).nullable().optional(),
  website_url: z.string().trim().url().max(500).nullable().optional(),
});
const payloadSchema = z.object({ suppliers: z.array(socialSupplierSchema).max(30) });
const responseSchema = z.object({
  output_text: z.string().optional(),
  output: z
    .array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() }))
    .optional(),
});

export function buildSocialPrompt(q: DiscoveryQuery): string {
  const what = q.category === "outros" && q.freeText !== undefined ? q.freeText : q.categoryLabel;
  return [
    `Encontre até ${String(q.limit)} perfis COMERCIAIS públicos de "${what}" que atendem ${cityLabel(q)},`,
    `para um evento do tipo ${q.eventTypeLabel}, no Instagram, Facebook (páginas) e TikTok.`,
    `Use apenas busca na web (ex.: site:instagram.com "${what}" "${q.city}", site:facebook.com, site:tiktok.com); não faça login nem acesse conteúdo restrito.`,
    `Regras: só perfis de empresas/profissionais; profile_url = link do perfil (não de post); telefone/WhatsApp SOMENTE se aparecer literalmente na bio/página pública; nunca invente.`,
    q.exclude.length > 0 ? `Ignore estes contatos já conhecidos: ${q.exclude.slice(0, 40).join(", ")}.` : "",
    `Responda SOMENTE com JSON: {"suppliers":[{"name":"","profile_url":"","phone":"","whatsapp_link":"","website_url":""}]}.`,
  ]
    .filter((l) => l.length > 0)
    .join(" ");
}

export function parseSocialResponse(body: unknown, query: DiscoveryQuery): SupplierCandidate[] {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return [];
  const text =
    parsed.data.output_text ??
    (parsed.data.output ?? [])
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("\n");
  const payload = payloadSchema.safeParse(extractJsonBlock(text));
  if (!payload.success) return [];
  const out: SupplierCandidate[] = [];
  const seen = new Set<string>();
  for (const s of payload.data.suppliers) {
    const profile = parseSocialProfile(s.profile_url);
    if (profile === null) continue;
    const externalId = `${profile.platform}:${profile.handle}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    out.push({
      name: s.name,
      category: query.category,
      phone: s.phone ?? undefined,
      whatsappLink: s.whatsapp_link ?? undefined,
      sourceUrl: profile.url,
      websiteUrl: s.website_url ?? undefined,
      externalId,
      city: query.city,
    });
  }
  return out;
}

export function createSocialProvider(options: { apiKey: string; model?: string; fetchImpl?: FetchLike }): DiscoveryProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    name: "social",
    async search(query: DiscoveryQuery): Promise<SupplierCandidate[]> {
      const res = await fetchImpl(`${XAI_BASE_URL}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model: options.model ?? XAI_DEFAULT_MODEL,
          input: [{ role: "user", content: buildSocialPrompt(query) }],
          tools: [{ type: "web_search" }],
          temperature: 0,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        if (res.status === 429 || res.status === 402 || res.status === 403) throw new ProviderQuotaError("social", res.status);
        throw new Error(`xAI HTTP ${String(res.status)}`);
      }
      return parseSocialResponse(await res.json(), query);
    },
  };
}
