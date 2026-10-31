import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { skipSupplierFollowUp } from "@/lib/quotes/runtime";

describe("follow-up de cotação sem canal legado", () => {
  it("não faz mais upsert em whatsapp_messages (regressão do canal removido)", () => {
    const source = readFileSync("lib/quotes/runtime.ts", "utf8");
    expect(source).not.toMatch(/whatsapp_messages["']\)\.upsert/);
    expect(source).not.toMatch(/quote_followup/);
    expect(source).not.toMatch(/idempotency_key/);
  });

  it("retorna 'skipped' e registra log estruturado, sem efeito colateral", () => {
    const logs: { payload: Record<string, unknown>; message: string }[] = [];
    const result = skipSupplierFollowUp(
      {
        eventId: "11111111-1111-4111-8111-111111111111",
        prospectId: "22222222-2222-4222-8222-222222222222",
        n: 1,
      },
      (payload, message) => logs.push({ payload, message }),
    );

    expect(result).toBe("skipped");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.payload).toMatchObject({
      reason: "whatsapp_removed",
      followup: 1,
    });
  });
});
