import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({ default: () => ({ variable: "font" }) }));

import { metadata as rootMeta } from "@/app/layout";
import { metadata as plannersMeta } from "@/app/(marketing)/para-planners/page";
import { buildFaq } from "@/lib/seo/faq";
import { faqLd, graph, localBusinessLd, serializeJsonLd, serviceLd } from "@/lib/seo/jsonld";

describe("metadata + JSON-LD publicados com a região de foco", () => {
  it("layout: título, descrição e OpenGraph", () => {
    const title = rootMeta.title as { default: string };
    expect(title.default).toContain("Vale do Paraíba e em São Paulo");
    expect(rootMeta.description).toContain("São Paulo");
    expect((rootMeta.openGraph as { description: string }).description).toContain("Vale do Paraíba");
  });

  it("para-planners: descrição e OpenGraph", () => {
    expect(plannersMeta.description).toContain("Vale do Paraíba e de São Paulo");
    expect((plannersMeta.openGraph as { description: string }).description).toContain("São Paulo");
  });

  it("script ld+json serializado contém areaServed e FAQ de cidade", () => {
    const json = serializeJsonLd(graph([serviceLd(9700, "https://x.test"), localBusinessLd("https://x.test"), faqLd(buildFaq(9700))]));
    const parsed = JSON.parse(json) as { "@graph": { areaServed?: { name: string }[]; mainEntity?: { name: string }[] }[] };
    for (const n of parsed["@graph"].filter((g) => g.areaServed)) {
      expect(n.areaServed?.map((a) => a.name)).toEqual(expect.arrayContaining(["São José dos Campos", "Taubaté", "Jacareí", "Pindamonhangaba", "Guaratinguetá", "Caçapava", "São Paulo"]));
    }
    const faq = parsed["@graph"].find((g) => g.mainEntity);
    expect(faq?.mainEntity?.map((q) => q.name)).toContain("Atende minha cidade?");
  });
});
