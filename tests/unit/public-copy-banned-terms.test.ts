import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHANNEL_POLICY_REPLY,
  containsBannedTerms,
  enforceSocialOnlyReply,
  rewriteBannedTerms,
} from "@/lib/ai/channel-policy";
import { contingencySupplierReply } from "@/lib/ai/contingency";
import { parseAgentReply } from "@/lib/prospecting/agent";
import { PRIVATE_REPLY_OPENER } from "@/lib/prospecting/content";
import { IDENTITY_PHRASE, sanitizeSupplierReply } from "@/lib/quotes/triage";

const ROOT = process.cwd();
const PERSONA = "um serviço autônomo de prospecção de fornecedores";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|mdx?|txt|html)$/.test(name)) out.push(path);
  }
  return out;
}

/** Remove comentários de código (não são texto público). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

// Texto público: site (exceto área admin interna), componentes, public/, textos legais/SEO e legendas.
const PUBLIC_FILES = [
  ...walk(join(ROOT, "app")).filter((p) => !p.includes(`${join("app", "admin")}`)),
  ...walk(join(ROOT, "components")).filter((p) => !p.includes(`${join("components", "admin")}`)),
  ...walk(join(ROOT, "public")),
  ...walk(join(ROOT, "lib", "legal")),
  ...walk(join(ROOT, "lib", "seo")),
  join(ROOT, "lib", "prospecting", "content.ts"),
  join(ROOT, "lib", "prospecting", "content-llm.ts"),
];

describe("termos proibidos em texto público (IA isolado / assistente virtual)", () => {
  it("detecta IA isolado e assistente virtual, mas permite EventeIA", () => {
    expect(containsBannedTerms("Somos uma IA")).toBe(true);
    expect(containsBannedTerms("nosso assistente virtual responde")).toBe(true);
    expect(containsBannedTerms("feito com inteligência artificial")).toBe(true);
    expect(containsBannedTerms("Somos a EventeIA")).toBe(false);
    expect(containsBannedTerms("Ideia de festa")).toBe(false);
  });

  it("nenhum arquivo de copy pública contém os termos", () => {
    const offenders = PUBLIC_FILES.filter((path) =>
      containsBannedTerms(stripComments(readFileSync(path, "utf8"))),
    ).map((path) => path.replace(ROOT, ""));
    expect(offenders).toEqual([]);
  });

  it("textos fixos (abertura, fallback, identidade, contingência) estão limpos e usam a persona", () => {
    const contingency =
      contingencySupplierReply({
        eventTitle: "Festa",
        eventType: "casamento",
        eventDateIso: "2027-05-15",
        city: "Taubaté",
        guestCount: 60,
        categoryLabel: "buffet",
        vendorName: "Buffet X",
      }).reply ?? "";
    for (const text of [PRIVATE_REPLY_OPENER, CHANNEL_POLICY_REPLY, IDENTITY_PHRASE, contingency]) {
      expect(containsBannedTerms(text)).toBe(false);
    }
    for (const text of [PRIVATE_REPLY_OPENER, IDENTITY_PHRASE, contingency])
      expect(text).toContain(PERSONA);
  });

  it("guarda de saída reescreve os termos nas respostas geradas", () => {
    expect(rewriteBannedTerms("Sou uma IA da EventeIA.")).toBe(`Sou ${PERSONA} da EventeIA.`);
    expect(enforceSocialOnlyReply("Nosso assistente virtual anotou. Qual o valor?")).not.toMatch(
      /assistente virtual/,
    );
    const agent = parseAgentReply(
      '{"reply":"Oi! Aqui é a IA da EventeIA. Qual o valor do serviço?"}',
    );
    expect(containsBannedTerms(agent?.reply ?? "")).toBe(false);
    expect(agent?.reply).toContain("EventeIA");
    expect(
      containsBannedTerms(sanitizeSupplierReply("Sou um assistente virtual, qual o valor?") ?? ""),
    ).toBe(false);
  });
});
