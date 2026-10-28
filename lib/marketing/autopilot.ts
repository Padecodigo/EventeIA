import "server-only";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createMediaContainer, publishContainer } from "@/lib/meta/publishing";
import { artForEventType } from "@/lib/prospecting/photos";
import { themeForHour, type MarketingTheme } from "./themes";

/** Prompt de publicidade (puro, testável). */
export function buildMarketingPrompt(theme: MarketingTheme): string {
  return [
    "Você é a EventeIA, inteligência de custos e cotações para eventos.",
    "Escreva uma legenda de Instagram (português do Brasil, tom editorial e humano, sem emojis, até 600 caracteres).",
    `Tema: ${theme.label}. Público: ${theme.audience}. Ângulo: ${theme.angle}.`,
    "Explique o valor: comparar propostas, três opções prontas, sem planilha e sem corretagem.",
    "Nunca cite valores de orçamento de clientes. Termine com 'EventeIA — Você imagina. A EventeIA faz acontecer.'",
    "Responda só a legenda.",
  ].join("\n");
}

async function captionFor(theme: MarketingTheme): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (key === undefined || key.length === 0) return `${theme.label}. EventeIA — Você imagina. A EventeIA faz acontecer.`;
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: buildMarketingPrompt(theme) }],
      temperature: 0.8,
      max_tokens: 400,
    }),
  });
  if (!response.ok) throw new Error(`deepseek ${String(response.status)}`);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? `${theme.label}.`;
}

/** Publica uma peça de publicidade (rotação por tema). Desligado => no-op. */
export async function publishAutopilotPost(now: Date = new Date()): Promise<{ posted: boolean; reason?: string }> {
  const env = serverEnv();
  if (env.META_ACCESS_TOKEN === undefined || env.META_INSTAGRAM_BUSINESS_ID === undefined) {
    return { posted: false, reason: "not_configured" };
  }
  const accessToken = env.META_ACCESS_TOKEN;
  const igUserId = env.META_INSTAGRAM_BUSINESS_ID;
  const theme = themeForHour(now.getHours());
  const imageUrl = `${env.NEXT_PUBLIC_APP_URL}${artForEventType(theme.key)}`;

  let caption: string;
  try {
    caption = await captionFor(theme);
  } catch (error) {
    logger.warn({ error: String(error) }, "autopilot: falha ao gerar legenda");
    return { posted: false, reason: "caption_failed" };
  }

  const container = await createMediaContainer({
    igUserId,
    accessToken,
    apiVersion: env.META_API_VERSION,
    imageUrl,
    caption,
  });
  if (!container.ok) {
    logger.warn({ error: container.error }, "autopilot: falha ao criar container");
    return { posted: false, reason: "container_failed" };
  }

  const published = await publishContainer({
    igUserId,
    accessToken,
    apiVersion: env.META_API_VERSION,
    creationId: container.id,
  });
  if (!published.ok) {
    logger.warn({ error: published.error }, "autopilot: falha ao publicar");
    return { posted: false, reason: "publish_failed" };
  }

  logger.info({ theme: theme.key, mediaId: published.id }, "autopilot: publicidade publicada");
  return { posted: true };
}
