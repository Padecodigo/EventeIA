import { pricingDocument, ticketPriceCents } from "@/lib/seo/pricing";

export const revalidate = 3600;

/** Preços em JSON para buscadores, comparadores e assistentes de IA. */
export function GET(): Response {
  return Response.json(pricingDocument(ticketPriceCents()), {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
