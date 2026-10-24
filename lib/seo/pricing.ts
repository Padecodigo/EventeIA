import { CREDIT_PACKAGES, PLANS } from "@/lib/plans";

import { absoluteUrl, siteUrl } from "./site";

interface PriceItem {
  code: string;
  name: string;
  priceCents: number;
  description: string;
}

export interface PricingDocument {
  service: string;
  url: string;
  currency: "BRL";
  unit: "cents";
  note: string;
  b2c: { name: string; priceCents: number; recurring: false };
  plans: (PriceItem & { creditsPerMonth: number; recurring: "monthly" })[];
  creditPackages: (PriceItem & { credits: number; recurring: false })[];
}

/** Tabela de preços legível por máquina (valores em centavos inteiros, BRL). */
export function pricingDocument(ticketPriceCents: number, base: string = siteUrl()): PricingDocument {
  return {
    service: "EventeIA",
    url: absoluteUrl("/planos", base),
    currency: "BRL" as const,
    unit: "cents" as const,
    note: "1 crédito = 1 evento ativado. Preços em centavos de real (inteiros).",
    b2c: { name: "Ticket avulso por evento", priceCents: ticketPriceCents, recurring: false as const },
    plans: PLANS.map((p) => ({ code: p.code, name: p.name, priceCents: p.priceCents, creditsPerMonth: p.credits, recurring: "monthly" as const, description: p.description })),
    creditPackages: CREDIT_PACKAGES.map((p) => ({ code: p.code, name: p.name, priceCents: p.priceCents, credits: p.credits, recurring: false as const, description: p.description })),
  };
}

export function ticketPriceCents(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.B2C_TICKET_PRICE_CENTS ?? "9700");
  return Number.isSafeInteger(n) && n > 0 ? n : 9700;
}
