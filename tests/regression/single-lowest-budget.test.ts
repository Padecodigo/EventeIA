import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Regressão de produto: um único orçamento, o de menor preço válido. */
const USER_FACING_FILES = [
  "app/(marketing)/page.tsx",
  "app/(marketing)/como-funciona/page.tsx",
  "app/preview/page.tsx",
  "app/dev/estilos/page.dev.tsx",
  "components/domain/scenarios-panel.tsx",
  "lib/quotes/export.ts",
  "lib/notifications/quotations-ready.ts",
  "lib/notifications/toast.ts",
] as const;

const REMOVED_SCENARIOS =
  /custo[- ]benef[ií]cio|custo_beneficio|comodidade|mais pr[aá]tico|3 op[cç][õo]es|tr[eê]s op[cç][õo]es|3 or[cç]amentos|tr[eê]s or[cç]amentos|3 cen[aá]rios|tr[eê]s cen[aá]rios|three (options|budgets|scenarios)/i;

describe("orçamento único de menor preço — textos ao usuário", () => {
  it.each(USER_FACING_FILES)("%s não menciona os cenários removidos", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(REMOVED_SCENARIOS);
  });
});
