/**
 * Limites e permissões oficiais da Meta — extraídos da documentação em
 * 2026-10-27. Cada valor cita a página de origem. NÃO altere por memória:
 * reconsulte e atualize `DOCS_CONSULTED_AT`.
 *
 * Páginas consultadas:
 * - https://developers.facebook.com/docs/instagram-platform/overview
 * - https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
 * - https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
 * - https://developers.facebook.com/docs/instagram-platform/private-replies
 * - https://developers.facebook.com/docs/instagram-platform/webhooks
 */

export const DOCS_CONSULTED_AT = "2026-10-27";

export const DOCS_LINKS = [
  "https://developers.facebook.com/docs/instagram-platform/overview",
  "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing",
  "https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media",
  "https://developers.facebook.com/docs/instagram-platform/private-replies",
  "https://developers.facebook.com/docs/instagram-platform/webhooks",
] as const;

/** Versão da Graph API usada nos exemplos oficiais consultados. */
export const GRAPH_API_VERSION = "v26.0";

/** Legenda (content publishing): máx. 2200 caracteres, 30 hashtags, 20 @menções. */
export const CAPTION = {
  maxChars: 2200,
  maxHashtags: 30,
  maxMentions: 20,
} as const;

/**
 * `user_tags` (marcações de pessoas na mídia): a página consultada descreve o
 * campo, mas NÃO declara um limite numérico. NÃO presumir — usar um teto
 * conservador (8) até confirmar na referência de IG User Media.
 */
export const USER_TAGS_MAX_CONFIRMED = false;
export const USER_TAGS_MAX_SAFE = 8;

/**
 * Publicações por 24h: a página de content publishing diz **100 posts/24h**
 * (carrossel conta como 1) e, em outro trecho, **50 posts/24h**. Discrepância
 * registrada; a configuração operacional usa MAX_POSTS_PER_DAY (padrão 2).
 */
export const POSTS_PER_24H = 100;
export const POSTS_PER_24H_ALT = 50;

/** Carrossel: até 20 mídias; imagens/vídeos hospedados publicamente. */
export const CAROUSEL_MAX_CHILDREN = 20;

/** Containers: expiram em 24h e a conta pode criar 400 por 24h. */
export const CONTAINER_TTL_HOURS = 24;
export const CONTAINERS_PER_24H = 400;

/** Private reply a comentário: 1 mensagem, em até 7 dias (Live: só durante). */
export const PRIVATE_REPLY_WINDOW_DAYS = 7;

/** Mensagens: janela padrão de 24h; até 7 dias em Click-to-Direct ad / human_agent. */
export const MESSAGING_WINDOW_HOURS = 24;
export const CLICK_TO_DIRECT_WINDOW_DAYS = 7;
export const HUMAN_AGENT_WINDOW_DAYS = 7;

/** Permissões por fluxo de login (Instagram Login x Facebook Login). */
export const PERMISSIONS = {
  instagramLogin: {
    publish: ["instagram_business_basic", "instagram_business_content_publish"],
    comments: ["instagram_business_basic", "instagram_business_manage_comments"],
    messages: ["instagram_business_basic", "instagram_business_manage_messages"],
    privateReply: [
      "instagram_business_basic",
      "instagram_business_manage_comments",
      "instagram_business_manage_messages",
    ],
  },
  facebookLogin: {
    publish: ["instagram_basic", "instagram_content_publish", "pages_read_engagement"],
    comments: ["instagram_basic", "instagram_manage_comments", "pages_read_engagement"],
    messages: ["instagram_basic", "instagram_manage_messages", "pages_read_engagement"],
    privateReply: [
      "instagram_basic",
      "instagram_manage_comments",
      "instagram_manage_messages",
      "pages_read_engagement",
    ],
  },
} as const;

/** Rate limits de mensagens (por conta profissional do Instagram). */
export const MESSAGING_RATE_LIMITS = {
  callsPerSecondPerAccount: 2,
  privateRepliesToPostCommentsPerHour: 750,
  privateRepliesToLiveCommentsPerSecond: 100,
  textMessagesPerSecond: 100,
  mediaMessagesPerSecond: 10,
} as const;

/** Especificações de imagem (JPEG) para publicação. */
export const IMAGE_SPECS = {
  format: "image/jpeg",
  maxBytes: 8 * 1024 * 1024,
  aspectRatioMin: "4:5",
  aspectRatioMax: "1.91:1",
  minWidthPx: 320,
  maxWidthPx: 1440,
  colorSpace: "sRGB",
} as const;

/**
 * Obrigação da plataforma: chat automatizado deve se identificar como
 * automatizado quando perguntado (ver seção "Human Agent"/disclosure).
 */
export const AUTOMATION_DISCLOSURE_REQUIRED = true;

/**
 * ModelsLab (SDXL): docs acessíveis em https://docs.modelslab.com, mas o
 * endpoint/autenticação da geração de imagem NÃO foram extraídos nesta consulta.
 * NÃO presumir — confirmar antes de implementar o gerador.
 */
export const MODELSLAB_DOCS = "https://docs.modelslab.com/llms.txt";
export const MODELSLAB_ENDPOINT_CONFIRMED = false;
