import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isRecipientOptedOut } from "@/lib/whatsapp/opt-out";

describe("isRecipientOptedOut", () => {
  const base = { prospectStatus: "pending", consentStatus: null, supplierOptOutAt: null };
  it("sem sinais de revogação: pode enviar", () => {
    expect(isRecipientOptedOut(base)).toBe(false);
    expect(isRecipientOptedOut({ ...base, consentStatus: "opted_in" })).toBe(false);
  });
  it("prospect opt_out, consents opted_out ou fornecedor com opt_out_at bloqueiam", () => {
    expect(isRecipientOptedOut({ ...base, prospectStatus: "opt_out" })).toBe(true);
    expect(isRecipientOptedOut({ ...base, consentStatus: "opted_out" })).toBe(true);
    expect(isRecipientOptedOut({ ...base, supplierOptOutAt: "2026-10-25T00:00:00Z" })).toBe(true);
  });
});

describe("senders checam a revogação no momento do envio", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("primeiro contato (whatsapp-worker) checa antes de sendFirstContactVia", () => {
    const s = src("lib/queue/whatsapp-worker.ts");
    const check = s.indexOf("await recipientOptedOut(");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(s.indexOf("await sendFirstContactVia("));
  });
  it("follow-up de cotação checa antes de sendTextVia", () => {
    const s = src("lib/quotes/runtime.ts");
    const check = s.indexOf("await recipientOptedOut(");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(s.indexOf("await sendTextVia("));
  });
  it("outbound ao cliente e convite de depoimento exigem opted_in", () => {
    expect(src("lib/jobs/whatsapp-outbound.ts")).toContain('consent?.status !== "opted_in"');
    expect(src("lib/jobs/testimonial-invites.ts")).toContain('consent?.status !== "opted_in"');
  });
});
