import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({ default: () => ({ variable: "font" }) }));

import { metadata as rootMeta } from "@/app/layout";
import { buildFaq } from "@/lib/seo/faq";
import { faqLd, graph, localBusinessLd, serializeJsonLd, serviceLd } from "@/lib/seo/jsonld";

describe("metadata + JSON-LD publicados", () => {
  it("layout: título, descrição e OpenGraph falam da região do cliente", () => {
    const title = rootMeta.title as { default: string };
    expect(title.default).toContain("Fornecedores e orçamento pronto");
    expect(rootMeta.description).toContain("da sua região");
    expect((rootMeta.openGraph as { description: string }).description).toContain("da sua região");
  });

  it("script ld+json serializado contém a FAQ pública", () => {
    const json = serializeJsonLd(
      graph([serviceLd(9700, "https://x.test"), localBusinessLd("https://x.test"), faqLd(buildFaq(9700))]),
    );
    const parsed = JSON.parse(json) as { "@graph": { mainEntity?: { name: string }[] }[] };
    const faq = parsed["@graph"].find((g) => g.mainEntity);
    expect(faq?.mainEntity?.map((q) => q.name)).toContain("Atende minha cidade?");
  });
});
