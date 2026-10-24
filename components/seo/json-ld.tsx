import { serializeJsonLd } from "@/lib/seo/jsonld";

/** Dados estruturados renderizados no servidor (não executa JS no cliente). */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // JSON-LD precisa ser inline; serializeJsonLd escapa "<" (sem injeção de HTML).
  // eslint-disable-next-line react/no-danger
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
