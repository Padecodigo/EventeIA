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
  "Orçamento de festa sem dor de cabeça: a EventeIA pede e compara orçamentos de fornecedores pelo Instagram e pelo Messenger para festa infantil, aniversário, 15 anos, formatura, casamento e evento corporativo com foco no Vale do Paraíba (São José dos Campos, Taubaté, Jacareí e região) e na cidade de São Paulo.";

export const SEO_KEYWORDS = [
  "orçamento de festa",
  "festa infantil",
  "casamento",
  "15 anos",
  "formatura",
  "evento corporativo",
  "fornecedores de festa",
  "cotação de buffet",
  "São José dos Campos",
  "Taubaté",
  "Vale do Paraíba",
  "São Paulo",
  "Grande São Paulo",
] as const;

export const SERVICE_AREA = [
  "São José dos Campos",
  "Taubaté",
  "Jacareí",
  "Caçapava",
  "Pindamonhangaba",
  "Guaratinguetá",
  "Vale do Paraíba",
  "São Paulo",
  "Grande São Paulo",
] as const;

/** Região de foco do marketing (não restringe onde o evento pode acontecer). */
export const FOCUS_REGION_LABEL = "Vale do Paraíba e São Paulo";

/** Imagem padrão de compartilhamento (Instagram, Facebook, X, LinkedIn). */
export const OG_IMAGE = { url: "/og", width: 1200, height: 630, alt: "EventeIA — orçamentos de festa comparados" } as const;

/** Rotas públicas indexáveis (sitemap + llms.txt). */
export const PUBLIC_ROUTES = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/como-funciona", priority: 0.8, changeFrequency: "monthly" },
  { path: "/planos", priority: 0.8, changeFrequency: "monthly" },
  { path: "/para-planners", priority: 0.7, changeFrequency: "monthly" },
  { path: "/termos", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacidade", priority: 0.3, changeFrequency: "yearly" },
  { path: "/estorno", priority: 0.3, changeFrequency: "yearly" },
  { path: "/retencao-de-dados", priority: 0.3, changeFrequency: "yearly" },
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
