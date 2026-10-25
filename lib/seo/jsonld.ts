import { CREDIT_PACKAGES, PLANS } from "@/lib/plans";

import type { FaqItem } from "./faq";
import { SERVICE_AREA, SITE_DESCRIPTION, SITE_NAME, absoluteUrl, siteUrl } from "./site";

type JsonLd = Record<string, unknown>;

/** Centavos inteiros → string decimal schema.org ("117.00"). */
export function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function organizationLd(base: string = siteUrl()): JsonLd {
  return {
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: SITE_NAME,
    url: absoluteUrl("/", base),
    logo: absoluteUrl("/logo-e.png", base),
    description: SITE_DESCRIPTION,
  };
}

export function websiteLd(base: string = siteUrl()): JsonLd {
  return {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: SITE_NAME,
    url: absoluteUrl("/", base),
    inLanguage: "pt-BR",
    publisher: { "@id": `${base}/#organization` },
  };
}

function areaServed(): JsonLd[] {
  return SERVICE_AREA.map((name) =>
    name === "Vale do Paraíba" || name === "Grande São Paulo"
      ? { "@type": "AdministrativeArea", name, containedInPlace: { "@type": "State", name: "São Paulo" } }
      : { "@type": "City", name, containedInPlace: { "@type": "State", name: "São Paulo" } },
  );
}

export function serviceLd(ticketPriceCents: number, base: string = siteUrl()): JsonLd {
  const offers = [
    {
      "@type": "Offer",
      name: "Ticket avulso por evento",
      price: centsToPrice(ticketPriceCents),
      priceCurrency: "BRL",
      url: absoluteUrl("/planos", base),
    },
    ...PLANS.map((p) => ({
      "@type": "Offer",
      name: `Plano ${p.name} (${p.credits} eventos/mês)`,
      description: p.description,
      price: centsToPrice(p.priceCents),
      priceCurrency: "BRL",
      url: absoluteUrl("/planos", base),
    })),
    ...CREDIT_PACKAGES.map((p) => ({
      "@type": "Offer",
      name: p.name,
      description: p.description,
      price: centsToPrice(p.priceCents),
      priceCurrency: "BRL",
      url: absoluteUrl("/planos", base),
    })),
  ];
  return {
    "@type": ["Service", "SoftwareApplication"],
    "@id": `${base}/#service`,
    name: `${SITE_NAME} — orçamento de festa pelo WhatsApp`,
    serviceType: "Cotação e comparação de fornecedores para eventos",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    provider: { "@id": `${base}/#organization` },
    areaServed: areaServed(),
    offers,
  };
}

export function localBusinessLd(base: string = siteUrl()): JsonLd {
  return {
    "@type": "LocalBusiness",
    "@id": `${base}/#localbusiness`,
    name: SITE_NAME,
    url: absoluteUrl("/", base),
    image: absoluteUrl("/og", base),
    description: SITE_DESCRIPTION,
    address: { "@type": "PostalAddress", addressRegion: "SP", addressCountry: "BR", addressLocality: "São José dos Campos" },
    areaServed: areaServed(),
    priceRange: "R$",
  };
}

export function faqLd(items: readonly FaqItem[]): JsonLd {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };
}

export function graph(nodes: JsonLd[]): JsonLd {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** JSON seguro para <script type="application/ld+json"> (sem fechar a tag). */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
