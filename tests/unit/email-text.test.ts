import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmailText, splitEmail } from "@/components/ui/email-text";

// Padrão aproximado do Email Obfuscation do Cloudflare (texto contínuo local@dominio).
const CF_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

describe("EmailText (Cloudflare email obfuscation → React #418)", () => {
  it("separa local e domínio", () => {
    expect(splitEmail("qa+1@eventeia.com.br")).toEqual(["qa+1", "eventeia.com.br"]);
    expect(splitEmail("semarroba")).toBeNull();
  });
  it("HTML do SSR não contém e-mail contínuo, mas o texto visível é o mesmo", () => {
    const html = renderToStaticMarkup(createElement(EmailText, { email: "qa+1@eventeia.com.br" }));
    expect(html).not.toMatch(CF_EMAIL);
    expect(html.replace(/<[^>]+>/g, "")).toBe("qa+1@eventeia.com.br");
  });
  it("telas com o e-mail do usuário usam EmailText", () => {
    for (const p of [
      "app/(dashboard)/layout.tsx",
      "app/(dashboard)/perfil/page.tsx",
      "app/admin/layout.tsx",
      "app/(auth)/redefinir-senha/page.tsx",
    ]) {
      const s = readFileSync(join(process.cwd(), p), "utf8");
      expect(s, p).toContain("<EmailText email={user.email} />");
    }
  });
});
