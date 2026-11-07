import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFaq } from "@/lib/seo/faq";
import { localBusinessLd, serviceLd } from "@/lib/seo/jsonld";
import { SEO_KEYWORDS, SERVICE_AREA, SITE_DESCRIPTION } from "@/lib/seo/site";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const REGIOES = /Vale do Paraíba|São José dos Campos|Taubaté|Jacareí|Pindamonhangaba|Guaratinguetá|Caçapava|Grande São Paulo/i;

describe("SEO — atendimento sem recorte geográfico", () => {
  it("descrição fala da região do cliente, sem citar cidade ou região fixa", () => {
    expect(SITE_DESCRIPTION).toContain("da sua região");
    expect(SITE_DESCRIPTION).not.toMatch(REGIOES);
  });

  it("keywords não têm cidades nem regiões", () => {
    expect(SEO_KEYWORDS).toEqual([
      "orçamento de festa",
      "festa infantil",
      "casamento",
      "15 anos",
      "formatura",
      "evento corporativo",
      "fornecedores de festa",
      "cotação de buffet",
    ]);
    for (const kw of SEO_KEYWORDS) expect(kw).not.toMatch(REGIOES);
  });

  it("areaServed é o Brasil (sem lista de cidades)", () => {
    for (const node of [serviceLd(9700, "https://x.test"), localBusinessLd("https://x.test")]) {
      const area = node.areaServed as { "@type": string; name: string }[];
      expect(area).toHaveLength(1);
      expect(area[0]).toMatchObject({ "@type": "Country", name: "Brasil" });
    }
  });

  it("FAQ 'Atende minha cidade?' responde sem citar regiões", () => {
    const item = buildFaq(9700).find((f) => f.q === "Atende minha cidade?");
    expect(item?.a).toContain("da sua região");
    expect(item?.a).not.toMatch(REGIOES);
  });

  it("nenhuma página ou metadata de marketing cita região fixa", () => {
    for (const file of [
      "app/layout.tsx",
      "app/og/route.tsx",
      "app/(marketing)/page.tsx",
      "app/(marketing)/como-funciona/page.tsx",
      "app/(marketing)/comprar/page.tsx",
    ]) {
      expect(read(file)).not.toMatch(REGIOES);
    }
  });
});
