import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { describe, expect, it } from "vitest";

import { PALETTE, hexToRgb } from "@/lib/design/palette";
import configImport from "@/tailwind.config";

const config =
  (configImport as unknown as { default?: typeof configImport }).default ?? configImport;

function ruleBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  const end = css.indexOf("}", open);
  return css.slice(start, end + 1);
}

describe("app/globals.css compila com o Tailwind do projeto", () => {
  it("gera .btn-primary com texto charcoal (text-on-primary resolvido)", async () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    const result = await postcss([tailwindcss(config)]).process(css, {
      from: resolve(process.cwd(), "app/globals.css"),
    });

    expect(result.css.length).toBeGreaterThan(0);

    const button = ruleBlock(result.css, ".btn-primary");
    expect(button).not.toBe("");

    const charcoalChannels = hexToRgb(PALETTE.onPrimary).join(" ");
    expect(button).toContain(`rgb(${charcoalChannels}`);
    expect(button).toContain("background-color: rgb(var(--tr-primaria)");
  });
});
