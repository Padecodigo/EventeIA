import { z } from "zod";

import type { DeepSeekClient } from "@/lib/deepseek/client";

import { buildPostContent } from "./content";

/**
 * Conteúdo do post gerado pela LLM (uma chamada para o plano inteiro).
 *
 * A LLM escreve a legenda com "quem somos / o que buscamos / como falar com a
 * EventeIA" e o prompt visual; se a resposta for inválida, cai no template
 * determinístico (`buildPostContent`) — o fluxo nunca quebra.
 */

export interface PlanContentEvent {
  title: string;
  typeLabel: string;
  city?: string;
  guestCount: number;
}

export interface PlanContentPost {
  index: number;
  category: string;
  handles: string[];
  part: number;
  totalParts: number;
}

export interface PlanContentInput {
  event: PlanContentEvent;
  posts: readonly PlanContentPost[];
  keyword: string;
}

export interface PostContentResult {
  index: number;
  imagePrompt: string;
  caption: string;
}

const responseSchema = z.object({
  posts: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        imagePrompt: z.string().trim().min(10).max(1500),
        caption: z.string().trim().min(20).max(2200),
      }),
    )
    .min(1),
});

export function buildContentSystemPrompt(keyword: string): string {
  return [
    "Você escreve posts de prospecção para a EventeIA (assessoria de orçamento de eventos).",
    "Para CADA item da lista, escreva: (1) imagePrompt — cena visual profissional do evento (sem texto, sem logos, sem nomes) para gerar imagem; (2) caption — legenda em português do Brasil que diga quem somos, o que estamos buscando naquela necessidade e como o fornecedor fala com a gente.",
    `Na legenda: mencione os @ recebidos, inclua a chamada "Comente ${keyword} e nosso assistente virtual envia o pedido por DM." e termine com "Imagens ilustrativas."`,
    "NUNCA invente preço, prazo ou promessa; não use emojis; tom editorial e humano.",
    "Responda SOMENTE JSON: {\"posts\":[{\"index\":0,\"imagePrompt\":\"\",\"caption\":\"\"}]}",
  ].join("\n");
}

export function buildContentUserPayload(input: PlanContentInput): string {
  return JSON.stringify({
    evento: {
      titulo: input.event.title,
      tipo: input.event.typeLabel,
      cidade: input.event.city ?? null,
      convidados: input.event.guestCount,
    },
    palavraChave: input.keyword,
    posts: input.posts.map((post) => ({
      index: post.index,
      necessidade: post.category,
      parte: `${String(post.part)}/${String(post.totalParts)}`,
      perfis: post.handles,
    })),
  });
}

function fallbackByIndex(input: PlanContentInput): Map<number, PostContentResult> {
  const map = new Map<number, PostContentResult>();
  for (const post of input.posts) {
    map.set(post.index, {
      index: post.index,
      ...buildPostContent({
        category: post.category,
        city: input.event.city,
        guestCount: input.event.guestCount,
        keyword: input.keyword,
        handles: post.handles,
        variant: post.index,
      }),
    });
  }
  return map;
}

export async function generatePlanContent(
  input: PlanContentInput,
  client: DeepSeekClient,
): Promise<PostContentResult[]> {
  if (input.posts.length === 0) return [];

  let raw: string;
  try {
    raw = await client.complete({
      messages: [
        { role: "system", content: buildContentSystemPrompt(input.keyword) },
        { role: "user", content: buildContentUserPayload(input) },
      ],
    });
  } catch {
    return [...fallbackByIndex(input).values()];
  }

  let parsed: z.infer<typeof responseSchema>;
  try {
    parsed = responseSchema.parse(JSON.parse(raw));
  } catch {
    return [...fallbackByIndex(input).values()];
  }

  const byIndex = new Map(parsed.posts.map((post) => [post.index, post]));
  const fallback = fallbackByIndex(input);
  if (input.posts.some((post) => !byIndex.has(post.index))) return [...fallback.values()];

  const out: PostContentResult[] = [];
  for (const post of input.posts) {
    const content = byIndex.get(post.index);
    const fallbackContent = fallback.get(post.index);
    if (content !== undefined) {
      out.push({ index: post.index, imagePrompt: content.imagePrompt, caption: content.caption });
    } else if (fallbackContent !== undefined) {
      out.push(fallbackContent);
    }
  }
  return out;
}
