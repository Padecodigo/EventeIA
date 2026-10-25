import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFaq } from "@/lib/seo/faq";
import { localBusinessLd, serviceLd } from "@/lib/seo/jsonld";
import { SEO_KEYWORDS, SERVICE_AREA, SITE_DESCRIPTION, pageMetadata } from "@/lib/seo/site";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const VALE = ["São José dos Campos", "Taubaté", "Jacareí", "Pindamonhangaba", "Guaratinguetá", "Caçapava"];

describe("SEO — foco Vale do Paraíba + São Paulo", () => {
  it("descrição menciona as duas regiões sem prometer exclusividade", () => {
    expect(SITE_DESCRIPTION).toContain("Vale do Paraíba");
    expect(SITE_DESCRIPTION).toContain("São Paulo");
    expect(SITE_DESCRIPTION).toMatch(/foco/);
    expect(SITE_DESCRIPTION).not.toMatch(/apenas|somente|exclusiv/i);
  });

  it("keywords e área de atendimento incluem Vale + São Paulo", () => {
    expect(SEO_KEYWORDS).toEqual(expect.arrayContaining(["São Paulo", "Vale do Paraíba"]));
    expect(SERVICE_AREA).toEqual(expect.arrayContaining([...VALE, "Vale do Paraíba", "São Paulo", "Grande São Paulo"]));
  });

  it("areaServed (Service e LocalBusiness) traz cidades do Vale e São Paulo", () => {
    for (const node of [serviceLd(9700, "https://x.test"), localBusinessLd("https://x.test")]) {
      const area = node.areaServed as { "@type": string; name: string }[];
      const names = area.map((a) => a.name);
      expect(names).toEqual(expect.arrayContaining([...VALE, "São Paulo", "Grande São Paulo"]));
      expect(area.find((a) => a.name === "São Paulo")?.["@type"]).toBe("City");
      expect(area.find((a) => a.name === "Grande São Paulo")?.["@type"]).toBe("AdministrativeArea");
    }
  });

  it("FAQ 'Atende minha cidade?' explica foco e aceita outras cidades", () => {
    const item = buildFaq(9700).find((f) => f.q === "Atende minha cidade?");
    expect(item).toBeDefined();
    expect(item?.a).toContain("Vale do Paraíba");
    expect(item?.a).toContain("São Paulo");
    expect(item?.a).toMatch(/outras cidades também são bem-vindos/);
    expect(item?.a).toMatch(/pode ser menor/);
  });

  it("OpenGraph de página usa a descrição com a região", () => {
    const m = pageMetadata({ title: "T", description: SITE_DESCRIPTION, path: "/" });
    expect((m.openGraph as { description: string }).description).toContain("São Paulo");
  });

  it("título padrão, hero, para-planners e imagem OG citam as regiões", () => {
    expect(read("app/layout.tsx")).toContain("no Vale do Paraíba e em São Paulo");
    expect(read("app/(marketing)/page.tsx")).toContain("com foco no Vale do Paraíba e em São Paulo");
    const planners = read("app/(marketing)/para-planners/page.tsx");
    expect(planners).toContain("Vale do Paraíba e de São Paulo");
    expect(planners).toContain("Hoje atendemos com mais força o Vale do Paraíba e São Paulo.");
    expect(read("app/og/route.tsx")).toContain("Vale do Paraíba · São Paulo");
  });
});
