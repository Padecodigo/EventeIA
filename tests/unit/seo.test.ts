import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { CREDIT_PACKAGES, PLANS } from "@/lib/plans";
import { SEARCH_AND_AI_BOTS } from "@/lib/seo/bots";
import { buildFaq } from "@/lib/seo/faq";
import { buildIndexNowPayload } from "@/lib/seo/indexnow";
import { centsToPrice, faqLd, graph, localBusinessLd, organizationLd, serializeJsonLd, serviceLd, websiteLd } from "@/lib/seo/jsonld";
import { pricingDocument } from "@/lib/seo/pricing";
import { PRIVATE_PREFIXES, absoluteUrl, pageMetadata, siteUrl } from "@/lib/seo/site";

const BASE = "https://eventeia.com.br";

describe("siteUrl", () => {
  it("prefere NEXT_PUBLIC_SITE_URL e remove barra final", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: `${BASE}/`, NEXT_PUBLIC_APP_URL: "http://x" })).toBe(BASE);
    expect(siteUrl({ NEXT_PUBLIC_APP_URL: "http://app.test" })).toBe("http://app.test");
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});

describe("robots", () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];

  it("bloqueia área privada para todos e aponta o sitemap", () => {
    for (const rule of rules) {
      for (const p of ["/painel", "/admin", "/api", "/dev"]) {
        expect(rule.disallow).toContain(p);
        expect(rule.disallow).toContain(`${p}/`);
      }
      expect(rule.allow).toBe("/");
    }
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("libera explicitamente os robôs de busca e IA verificados", () => {
    const named = rules.flatMap((rule) => (Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent]));
    for (const ua of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "Google-Extended", "Googlebot", "Bingbot", "ClaudeBot", "PerplexityBot", "meta-externalagent", "meta-externalfetcher", "FacebookBot", "Applebot", "Applebot-Extended", "DuckDuckBot", "Amazonbot", "YouBot", "CCBot", "Bytespider", "*"]) {
      expect(named).toContain(ua);
    }
    expect(new Set(SEARCH_AND_AI_BOTS).size).toBe(SEARCH_AND_AI_BOTS.length);
  });
});

describe("sitemap", () => {
  it("lista só URLs públicas absolutas e únicas", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      const { pathname } = new URL(url);
      expect(PRIVATE_PREFIXES.some((p) => pathname.startsWith(p))).toBe(false);
    }
    expect(urls.map((u) => new URL(u).pathname)).toEqual(expect.arrayContaining(["/", "/planos", "/como-funciona", "/para-planners"]));
  });
});

describe("pageMetadata", () => {
  it("gera canonical, og pt_BR 1200x630 e twitter large", () => {
    const m = pageMetadata({ title: "Planos", description: "d", path: "/planos" });
    expect(m.alternates?.canonical).toBe(absoluteUrl("/planos"));
    const og = m.openGraph as { locale: string; images: { width: number; height: number }[] };
    expect(og.locale).toBe("pt_BR");
    expect(og.images[0]).toMatchObject({ width: 1200, height: 630 });
    expect((m.twitter as { card: string }).card).toBe("summary_large_image");
    expect(m.keywords).toEqual(expect.arrayContaining(["orçamento de festa", "Vale do Paraíba", "Taubaté"]));
  });
});

describe("JSON-LD", () => {
  const faq = buildFaq(9700);
  const data = graph([organizationLd(BASE), websiteLd(BASE), serviceLd(9700, BASE), localBusinessLd(BASE), faqLd(faq)]);
  const nodes = data["@graph"] as Record<string, unknown>[];

  it("é JSON válido schema.org e não fecha a tag script", () => {
    const html = serializeJsonLd({ ...data, x: "</script><b>" });
    expect(html).not.toContain("</script>");
    expect(JSON.parse(html)).toMatchObject({ "@context": "https://schema.org" });
  });

  it("tem os tipos exigidos com @type", () => {
    const types = nodes.flatMap((n) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]));
    expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite", "Service", "SoftwareApplication", "LocalBusiness", "FAQPage"]));
  });

  it("ofertas espelham os planos em BRL", () => {
    const service = nodes.find((n) => n["@id"] === `${BASE}/#service`) as { offers: { price: string; priceCurrency: string }[] };
    expect(service.offers).toHaveLength(1 + PLANS.length + CREDIT_PACKAGES.length);
    expect(service.offers.every((o) => o.priceCurrency === "BRL" && /^\d+\.\d{2}$/.test(o.price))).toBe(true);
    expect(centsToPrice(11_700)).toBe("117.00");
  });

  it("LocalBusiness atende o Vale do Paraíba", () => {
    const lb = nodes.find((n) => n["@type"] === "LocalBusiness") as { areaServed: { name: string }[] };
    expect(lb.areaServed.map((a) => a.name)).toEqual(expect.arrayContaining(["Vale do Paraíba", "São José dos Campos", "Taubaté"]));
  });

  it("FAQPage tem pergunta e resposta para cada item", () => {
    const f = faqLd(faq) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(f.mainEntity).toHaveLength(faq.length);
    expect(f.mainEntity.every((q) => q.name.length > 0 && q.acceptedAnswer.text.length > 0)).toBe(true);
  });
});

describe("IndexNow", () => {
  it("filtra outros hosts e rotas privadas", () => {
    const p = buildIndexNowPayload(BASE, "abcd1234abcd", [`${BASE}/`, `${BASE}/planos`, `${BASE}/painel`, "https://outro.com/x", `${BASE}/planos`], PRIVATE_PREFIXES);
    expect(p.host).toBe("eventeia.com.br");
    expect(p.keyLocation).toBe(`${BASE}/indexnow-key.txt`);
    expect(p.urlList).toEqual([`${BASE}/`, `${BASE}/planos`]);
  });

  it("rejeita chave inválida", () => {
    expect(() => buildIndexNowPayload(BASE, "x", [])).toThrow();
  });
});

describe("arquivos para IAs", () => {
  const full = readFileSync(join(process.cwd(), "public/llms-full.txt"), "utf8");
  const short = readFileSync(join(process.cwd(), "public/llms.txt"), "utf8");

  it("llms.txt segue o formato (H1 + resumo) e links", () => {
    expect(short.startsWith("# EventeIA")).toBe(true);
    expect(short).toMatch(/^> /m);
    expect(short).toContain("/precos.json");
  });

  it("llms-full.txt traz os preços reais dos planos", () => {
    const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
    for (const p of [...PLANS, ...CREDIT_PACKAGES]) expect(full).toContain(brl(p.priceCents));
  });

  it("precos.json usa centavos inteiros", () => {
    const doc = pricingDocument(9700, BASE);
    expect(doc.unit).toBe("cents");
    expect([doc.b2c, ...doc.plans, ...doc.creditPackages].every((x) => Number.isSafeInteger(x.priceCents))).toBe(true);
  });
});
