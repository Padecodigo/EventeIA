import { describe, expect, it } from "vitest";

import { createMemoryLedger, createRouter, type LlmClient } from "@/lib/ai/router";
import { routeOptOutIntent } from "@/lib/ai/tasks";
import {
  buildUsageReport,
  closedOutsideSummary,
  daysBetween,
  filtersToQuery,
  matchesFilters,
  parseUsageFilters,
  rowBrlCents,
  type UsageRow,
} from "@/lib/usage/report";
import { defaultStageForTask, deriveEventStage, isProcessStage } from "@/lib/usage/stages";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const row = (o: Partial<UsageRow>): UsageRow => ({
  at: "2026-10-10T12:00:00Z", provider: "deepseek", task: "quotation_extraction", outcome: "ok",
  profileId: U1, eventId: null, stage: "quote_collection", channel: "evolution",
  inputTokens: 100, outputTokens: 10, costMicroUsd: 1000, costBrlCents: 1, ...o,
});
const now = new Date("2026-10-24T12:00:00Z");

describe("parseUsageFilters", () => {
  it("valida e ignora valores inválidos", () => {
    const f = parseUsageFilters({ from: "2026-10-01", to: "2026-10-05", task: "x'; drop", user: "nope", stage: "hack", channel: "sms", provider: "openai" }, now);
    expect(f).toEqual({ from: "2026-10-01", to: "2026-10-05" });
  });
  it("aceita filtros válidos (inclusive URLSearchParams e 'none')", () => {
    const f = parseUsageFilters(new URLSearchParams(`task=negotiation&user=${U1.toUpperCase()}&stage=none&channel=evolution&provider=grok`), now);
    expect(f).toMatchObject({ from: "2026-10-01", to: "2026-10-24", task: "negotiation", user: U1, stage: "none", channel: "evolution", provider: "grok" });
    expect(parseUsageFilters(new URLSearchParams(filtersToQuery(f)), now)).toEqual(f);
  });
});

describe("matchesFilters / buildUsageReport", () => {
  const f = { from: "2026-10-09", to: "2026-10-11" };
  const rows = [
    row({}),
    row({ profileId: U2, stage: "discovery", task: "discovery_search", channel: null, costMicroUsd: 5000 }),
    row({ at: "2026-10-11T03:00:00Z" }),
    row({ at: "2026-09-01T00:00:00Z" }),
  ];
  it("filtra por usuário, estágio, canal e 'sem canal'", () => {
    expect(rows.filter((r) => matchesFilters(r, { ...f, user: U2 }))).toHaveLength(1);
    expect(rows.filter((r) => matchesFilters(r, { ...f, stage: "quote_collection" }))).toHaveLength(2);
    expect(rows.filter((r) => matchesFilters(r, { ...f, channel: "none" }))).toHaveLength(1);
    expect(rows.filter((r) => matchesFilters(r, { ...f, stage: "none" }))).toHaveLength(0);
  });
  it("agrega totais, série diária contínua e grupos por custo", () => {
    const r = buildUsageReport(rows, f);
    expect(r.totals).toEqual({ calls: 3, inputTokens: 300, outputTokens: 30, costMicroUsd: 7000, costBrlCents: 3 });
    expect(r.byDay.map((d) => [d.day, d.calls])).toEqual([["2026-10-09", 0], ["2026-10-10", 2], ["2026-10-11", 1]]);
    expect(r.groups[0]).toMatchObject({ task: "discovery_search", profileId: U2, stage: "discovery", calls: 1 });
    expect(r.groups[1]).toMatchObject({ task: "quotation_extraction", calls: 2, costMicroUsd: 2000 });
    expect(r.tasks).toEqual(["discovery_search", "quotation_extraction"]);
  });
  it("daysBetween respeita o limite", () => {
    expect(daysBetween("2026-01-01", "2026-12-31", 10)).toHaveLength(10);
  });
  it("BRL usa o valor gravado ou converte pelo câmbio", () => {
    expect(rowBrlCents(1_000_000, 777, null)).toBe(777);
    expect(rowBrlCents(1_000_000, null, 5_000_000)).toBe(500);
  });
});

describe("estágios", () => {
  it("deriva do task e do evento", () => {
    expect(defaultStageForTask("discovery_search")).toBe("discovery");
    expect(defaultStageForTask("desconhecida")).toBeNull();
    expect(isProcessStage("proposal")).toBe(true);
    const base = { status: "active", interview_completed_at: null, discovery_started_at: null, collection_ended_at: null, quotes_delivered_at: null };
    expect(deriveEventStage(base)).toBe("briefing");
    expect(deriveEventStage({ ...base, interview_completed_at: "x" })).toBe("discovery");
    expect(deriveEventStage({ ...base, discovery_started_at: "x" })).toBe("quote_collection");
    expect(deriveEventStage({ ...base, quotes_delivered_at: "x" })).toBe("proposal");
    expect(deriveEventStage({ ...base, status: "completed" })).toBe("confirmation");
  });
  it("resume fechamentos por fora por estágio × canal", () => {
    const s = closedOutsideSummary([
      { eventId: "a", at: "", stage: "quote_collection", channel: "evolution" },
      { eventId: "b", at: "", stage: "quote_collection", channel: "evolution" },
      { eventId: "c", at: "", stage: "proposal", channel: null },
    ]);
    expect(s).toEqual([{ stage: "quote_collection", channel: "evolution", count: 2 }, { stage: "proposal", channel: null, count: 1 }]);
  });
});

describe("roteador propaga o contexto de consumo", () => {
  it("grava usuário, estágio e canal no ledger", async () => {
    const ledger = createMemoryLedger();
    const nim: LlmClient = { name: "nim", complete: () => Promise.resolve({ content: '{"opt_out":true,"confidence_score":0.9}', inputTokens: 10, outputTokens: 5 }) };
    const router = createRouter({ clients: [nim], ledger, prices: { nim: { inPer1M: 0, outPer1M: 0 }, grok: { inPer1M: 0, outPer1M: 0 }, deepseek: { inPer1M: 0, outPer1M: 0 } }, cap: { switchPct: 25, bootstrapMicroUsd: 0 } });
    await routeOptOutIntent(router, "pare", { eventId: "e1", profileId: U1, stage: "prospecting", channel: "evolution" });
    expect(ledger.entries[0]).toMatchObject({ task: "optout_intent", eventId: "e1", profileId: U1, stage: "prospecting", channel: "evolution" });
  });
});
