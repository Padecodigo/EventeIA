import { describe, expect, it } from "vitest";

import {
  FORWARDED_MESSAGE_NOTICE,
  withAutomationNotice,
} from "@/lib/outreach/automation-notice";

describe("withAutomationNotice", () => {
  it("prefixa o aviso e uma quebra de linha ao texto aparado", () => {
    const result = withAutomationNotice("  olá fornecedor  ");
    expect(result).toBe(`${FORWARDED_MESSAGE_NOTICE}\nolá fornecedor`);
    expect(result.startsWith(FORWARDED_MESSAGE_NOTICE)).toBe(true);
  });

  it("é idempotente: aplicar duas vezes equivale a aplicar uma vez", () => {
    const once = withAutomationNotice("texto do cliente");
    const twice = withAutomationNotice(once);
    expect(twice).toBe(once);
  });

  it("o aviso contém 'serviço autônomo' e não contém o termo proibido", () => {
    expect(FORWARDED_MESSAGE_NOTICE).toContain("serviço autônomo");
    expect(FORWARDED_MESSAGE_NOTICE).not.toMatch(/\bIA\b/);
    expect(FORWARDED_MESSAGE_NOTICE).not.toMatch(/isca/i);
  });
});
