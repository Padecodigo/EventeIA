import type { Metadata } from "next";

/** URL canônica do site público. NEXT_PUBLIC_SITE_URL > NEXT_PUBLIC_APP_URL > localhost. */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function absoluteUrl(path: string, base: string = siteUrl()): string {
  if (path === "/" || path === "") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const SITE_NAME = "EventeIA";

export const SITE_DESCRIPTION =
  "Vai organizar um casamento, aniversário, 15 anos, formatura ou evento corporativo? Você conta como é o evento e a EventeIA encontra os fornecedores da sua região, compara os preços e entrega o orçamento pronto.";

export const SEO_KEYWORDS = [
  "orçamento de festa",
  "festa infantil",
  "casamento",
  "15 anos",
  "formatura",
  "evento corporativo",
  "fornecedores de festa",
  "cotação de buffet",
] as const;

/** O serviço vale em qualquer cidade informada pelo cliente — sem recorte geográfico fixo. */
export const SERVICE_AREA = ["Brasil"] as const;

/** Imagem padrão de compartilhamento (Instagram, Facebook, X, LinkedIn). */
export const OG_IMAGE = { url: "/og", width: 1200, height: 630, alt: "EventeIA — orçamentos de festa comparados" } as const;

/** Rotas públicas indexáveis (sitemap + llms.txt). */
export const PUBLIC_ROUTES = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/como-funciona", priority: 0.8, changeFrequency: "monthly" },
  { path: "/comprar", priority: 0.9, changeFrequency: "monthly" },
  { path: "/termos", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacidade", priority: 0.3, changeFrequency: "yearly" },
  { path: "/estorno", priority: 0.3, changeFrequency: "yearly" },
  { path: "/retencao-de-dados", priority: 0.3, changeFrequency: "yearly" },
  { path: "/exclusao-de-dados", priority: 0.3, changeFrequency: "yearly" },
  { path: "/precos.json", priority: 0.3, changeFrequency: "monthly" },
] as const;

/** Prefixos privados: nunca indexar. */
export const PRIVATE_PREFIXES = [
  "/painel",
  "/admin",
  "/api",
  "/dev",
  "/eventos",
  "/creditos",
  "/perfil",
  "/depoimento",
] as const;

interface PageSeo {
  title: string;
  description: string;
  path: string;
  keywords?: readonly string[];
}

/** Metadata por página: canonical, OG/Twitter pt-BR com imagem 1200x630. */
export function pageMetadata({ title, description, path, keywords = [] }: PageSeo): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    keywords: [...new Set([...keywords, ...SEO_KEYWORDS])],
    alternates: { canonical: url },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "pt_BR",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
