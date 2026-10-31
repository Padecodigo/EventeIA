/**
 * Robôs de busca e de IA liberados nas páginas públicas.
 * Só nomes de user-agent publicados na documentação oficial de cada empresa.
 * xAI/Grok e Manus não publicam um user-agent de crawler: ficam cobertos pela regra genérica "*".
 */
export const SEARCH_AND_AI_BOTS = [
  // Google (busca + Gemini/IA)
  "Googlebot",
  "Google-Extended",
  // Microsoft Bing (alimenta Copilot e a busca do ChatGPT)
  "Bingbot",
  // OpenAI / ChatGPT
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic / Claude
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Meta / Llama
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  "facebookexternalhit",
  // Apple (Siri/Spotlight + Apple Intelligence)
  "Applebot",
  "Applebot-Extended",
  // Outros buscadores e IAs
  "DuckDuckBot",
  "Amazonbot",
  "YouBot",
  "CCBot",
  "Bytespider",
  "YandexBot",
  "SeznamBot",
  // Prévias de link
  "Twitterbot",
  "LinkedInBot",
] as const;
