import "server-only";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { metaPublishConfigFromEnv } from "@/lib/meta/config";
import { createMediaContainer, publishContainer, publishToChannels } from "@/lib/meta/publishing";
import {
  artForEventType,
  reelArtForEventType,
  storyArtForEventType,
} from "@/lib/prospecting/photos";

import { generatePostArt, generateReelArt, generateStoryArt } from "./autopilot-art";
import { loadUsedMedia, recordMediaUse, type AutopilotMediaKind } from "./autopilot-media";
import { pickFirstUnusedRecently, STATIC_REUSE_WINDOW_MS, staticMediaKey } from "./media-dedup";
import { MARKETING_THEMES, themeForHour, type MarketingTheme } from "./themes";

/** Prompt de publicidade (puro, testável). */
export function buildMarketingPrompt(theme: MarketingTheme): string {
  return [
    "Você é a EventeIA, inteligência de custos e cotações para eventos.",
    "Escreva uma legenda de Instagram (português do Brasil, tom editorial e humano, sem emojis, até 600 caracteres).",
    `Tema: ${theme.label}. Público: ${theme.audience}. Ângulo: ${theme.angle}.`,
    "Explique o valor: comparar propostas e entregar um orçamento pronto no menor preço válido, sem planilha e sem corretagem.",
    "Nunca cite valores de orçamento de clientes. Termine com 'EventeIA — Você imagina. A EventeIA faz acontecer.'",
    "Responda só a legenda.",
  ].join("\n");
}

async function captionFor(theme: MarketingTheme): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (key === undefined || key.length === 0)
    return `${theme.label}. EventeIA — Você imagina. A EventeIA faz acontecer.`;
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

/**
 * Arte estática (fallback) com dedup: usa o asset se ele não foi publicado nos
 * últimos 24h e registra o uso. Devolve `null` quando o asset já foi usado
 * recentemente (o chamador deve pular a publicação).
 */
async function staticArtUrl(
  theme: MarketingTheme,
  kind: AutopilotMediaKind,
  staticPath: string,
  baseUrl: string,
): Promise<string | null> {
  const url = `${baseUrl}${staticPath}`;
  try {
    const uses = await loadUsedMedia();
    const chosen = pickFirstUnusedRecently(
      [staticPath],
      uses,
      (path) => staticMediaKey(path),
      STATIC_REUSE_WINDOW_MS,
      Date.now(),
    );
    if (chosen === null) return null;
    await recordMediaUse({ mediaKey: staticMediaKey(chosen), kind, theme: theme.key, url });
  } catch (error) {
    // Sem o registro de dedup (DB indisponível) publicamos a estática mesmo assim.
    logger.warn(
      { error: String(error), theme: theme.key },
      "autopilot: dedup de mídia indisponível; usando arte estática sem garantia de unicidade",
    );
  }
  return url;
}

/** Publica uma peça de publicidade (rotação por tema). Desligado => no-op. */
export async function publishAutopilotPost(
  now: Date = new Date(),
): Promise<{ posted: boolean; reason?: string }> {
  const env = serverEnv();
  const config = metaPublishConfigFromEnv(env);
  if (config.igUserId.length === 0 || config.accessToken.length === 0) {
    return { posted: false, reason: "not_configured" };
  }
  // 6 slots/dia (a cada 4h), com ordem embaralhada entre os dias — sem repetir imagem no dia.
  const dayOffset = Math.floor(now.getTime() / 86_400_000) % MARKETING_THEMES.length;
  const theme = themeForHour(now.getHours(), dayOffset);

  let caption: string;
  try {
    caption = await captionFor(theme);
  } catch (error) {
    logger.warn({ error: String(error) }, "autopilot: falha ao gerar legenda");
    return { posted: false, reason: "caption_failed" };
  }

  const postArt = await generatePostArt(theme);
  let imageUrl: string;
  if (postArt !== null) {
    imageUrl = postArt.url;
  } else {
    const staticUrl = await staticArtUrl(
      theme,
      "post",
      artForEventType(theme.key),
      env.NEXT_PUBLIC_APP_URL,
    );
    if (staticUrl === null) {
      logger.warn({ theme: theme.key }, "autopilot: sem arte única para o post; cancelando");
      return { posted: false, reason: "no_unique_art" };
    }
    imageUrl = staticUrl;
    logger.warn({ theme: theme.key }, "autopilot: FLUX indisponível no post; usando arte estática");
  }

  const result = await publishToChannels({ ...config, imageUrl, caption });

  // Story (Instagram only): vertical 9:16 com a logo, sem legenda.
  if (result.kind === "published") {
    try {
      const storyArt = await generateStoryArt(theme);
      let storyUrl: string | null = null;
      if (storyArt !== null) {
        storyUrl = storyArt.url;
      } else {
        storyUrl = await staticArtUrl(
          theme,
          "story",
          storyArtForEventType(theme.key),
          env.NEXT_PUBLIC_APP_URL,
        );
        if (storyUrl !== null) {
          logger.warn(
            { theme: theme.key },
            "autopilot: FLUX indisponível no story; usando arte estática",
          );
        } else {
          logger.warn({ theme: theme.key }, "autopilot: sem arte única para o story; pulando");
        }
      }
      if (storyUrl !== null) {
        const storyContainer = await createMediaContainer({
          ...config,
          imageUrl: storyUrl,
          caption: "",
          mediaType: "STORIES",
        });
        if (storyContainer.ok) {
          await publishContainer({ ...config, creationId: storyContainer.id });
          logger.info({ theme: theme.key }, "autopilot: story publicada");
        }
      }
      const reelArt = await generateReelArt(theme);
      let reelUrl: string | null = null;
      if (reelArt !== null) {
        reelUrl = reelArt.url;
      } else {
        reelUrl = await staticArtUrl(
          theme,
          "reel",
          reelArtForEventType(theme.key),
          env.NEXT_PUBLIC_APP_URL,
        );
        if (reelUrl !== null) {
          logger.warn(
            { theme: theme.key },
            "autopilot: FLUX indisponível no reel; usando arte estática",
          );
        } else {
          logger.warn({ theme: theme.key }, "autopilot: sem arte única para o reel; pulando");
        }
      }
      if (reelUrl !== null) {
        const reelContainer = await createMediaContainer({
          ...config,
          imageUrl: reelUrl,
          videoUrl: reelUrl,
          caption,
          mediaType: "REELS",
        });
        if (reelContainer.ok) {
          await publishContainer({ ...config, creationId: reelContainer.id });
          logger.info({ theme: theme.key }, "autopilot: reel publicado");
        }
      }
    } catch (error) {
      logger.warn({ error: String(error) }, "autopilot: falha ao publicar story");
    }
    logger.info({ theme: theme.key }, "autopilot: publicidade publicada");
    return { posted: true };
  }
  logger.warn(
    { theme: theme.key, error: result.error ?? "falha ao publicar" },
    "autopilot: falha ao publicar",
  );
  return { posted: false, reason: "publish_failed" };
}
