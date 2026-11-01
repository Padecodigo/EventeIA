/**
 * Simulação do fluxo completo (QA 2026-11-01) — puro, sem rede, sem Meta real.
 * Testes marcados `.fails` documentam lacunas conhecidas (comportamento pedido ainda não existe).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isEventStarted, scheduledSearchStartAt } from "@/lib/events/edit-lock";
import { parseBudgetLimitInput } from "@/lib/events/budget-limit";
import { planPostBatches } from "@/lib/prospecting/batch";
import { USER_TAGS_MAX } from "@/lib/meta/limits";
import { shouldDeletePost } from "@/lib/prospecting/delete-policy";
import { canDeleteFromHistory } from "@/lib/events/history-deletion";
import { parseMetaWebhook } from "@/lib/meta/webhook";

const ev = (d: string) => ({ status: "active", discovery_started_at: null, search_start_date: d });

describe("1) login IG/FB + follow/1ª DM", () => {
  it("login social só oferece Google (sem facebook/instagram)", () => {
    const src = readFileSync("app/(auth)/actions.ts", "utf8");
    expect(src).toContain('provider: "google"');
    expect(src).not.toMatch(/provider: "(facebook|instagram)"/);
  });
  it("1ª DM IG formato changes[] (teste do painel Meta) é parseada", () => {
    const payload = { object: "instagram", entry: [{ id: "1", time: 1, changes: [{ field: "messages", value: { sender: { id: "u1" }, recipient: { id: "1" }, timestamp: "1", message: { mid: "m1", text: "oi" } } }] }] };
    expect(parseMetaWebhook(payload)?.length ?? 0).toBeGreaterThan(0);
  });
  it.fails("LACUNA?: 1ª DM IG formato real entry[].messaging[] (Instagram API) é parseada", () => {
    const payload = { object: "instagram", entry: [{ id: "1", time: 1, messaging: [{ sender: { id: "u1" }, recipient: { id: "1" }, timestamp: 1, message: { mid: "m1", text: "oi" } }] }] };
    const r = parseMetaWebhook(payload);
    expect(r?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("2) trava exata no início agendado (0073/0074)", () => {
  it("edita até 08:59:59 BRT e trava às 09:00 BRT", () => {
    const at = scheduledSearchStartAt("2026-11-03")!;
    expect(at.toISOString()).toBe("2026-11-03T12:00:00.000Z");
    expect(isEventStarted(ev("2026-11-03"), new Date(at.getTime() - 1000))).toBe(false);
    expect(isEventStarted(ev("2026-11-03"), at)).toBe(true);
  });
  it("rascunho nunca trava", () => {
    expect(isEventStarted({ ...ev("2026-01-01"), status: "draft" })).toBe(false);
  });
});

describe("3) orçamento limite", () => {
  it("aceita formatos BRL e vazio", () => {
    expect(parseBudgetLimitInput("R$ 25.000,50")).toEqual({ ok: true, cents: 2_500_050 });
    expect(parseBudgetLimitInput("")).toEqual({ ok: true, cents: null });
  });
});

describe("4) marcações: transborda p/ novo post", () => {
  it(`19 fornecedores com teto ${USER_TAGS_MAX} → 3 posts, nenhum perdido`, () => {
    const s = Array.from({ length: 19 }, (_, i) => ({ handle: `f${i}`, category: "buffet" }));
    const b = planPostBatches(s, { maxTagsPerPost: USER_TAGS_MAX, maxPostsPerDay: 2 });
    expect(b.map((x) => x.handles.length)).toEqual([8, 8, 3]);
    expect(b.map((x) => x.dayIndex)).toEqual([0, 0, 1]);
  });
});

describe("8) encerramento", () => {
  it("histórico só apaga evento encerrado", () => {
    expect(canDeleteFromHistory("completed")).toBe(true);
    expect(canDeleteFromHistory("active")).toBe(false);
  });
});

describe("9) exclusão de posts", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  it("apaga ao encerrar/cancelar", () => {
    expect(shouldDeletePost({ eventStatus: "completed", createdAt: now, now })).toBe(true);
    expect(shouldDeletePost({ eventStatus: "canceled", createdAt: now, now })).toBe(true);
  });
  it.fails("LACUNA: apagar quando TODOS os marcados já contataram (evento ativo)", () => {
    expect(
      shouldDeletePost({ eventStatus: "active", createdAt: now, now, allTaggedContacted: true } as never),
    ).toBe(true);
  });
});
