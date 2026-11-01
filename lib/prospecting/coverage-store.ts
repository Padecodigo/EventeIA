import "server-only";

import type { DeepSeekClient } from "@/lib/deepseek/client";
import { normalizeScopeItem } from "@/lib/quotes/scope-items";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { COVERAGE_VALUES, type CoverageRow, type CoverageValue } from "./coverage-loop";
import type { CoveragePorts } from "./coverage-turn";

interface DbRow {
  prospect_quote_id: string;
  item_code: string;
  coverage: string;
  extra_price_cents: number | null;
  quantity_covered: number | null;
  evidence: string | null;
  source: CoverageRow["source"];
  confidence: number | string;
  rounds_asked: number;
  asked_at: string | null;
  answered_at: string | null;
}

/** Interface mínima: tipos gerados ainda não conhecem a tabela da 0078. */
interface CoverageDb {
  from(table: "prospect_quotes"): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): Promise<{ data: { id: string }[] | null }>;
        };
      };
    };
  };
  from(table: "quote_item_coverage"): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: DbRow[] | null }>;
    };
    upsert(
      values: Record<string, unknown>[],
      options: { onConflict: string },
    ): Promise<{ error: { code?: string } | null }>;
  };
}

function toRow(r: DbRow): CoverageRow {
  const coverage = (COVERAGE_VALUES as readonly string[]).includes(r.coverage) ? (r.coverage as CoverageValue) : "unknown";
  return {
    itemCode: normalizeScopeItem(r.item_code),
    coverage,
    extraPriceCents: r.extra_price_cents === null ? null : Number(r.extra_price_cents),
    quantityCovered: r.quantity_covered,
    evidence: r.evidence,
    source: r.source,
    confidence: Number(r.confidence),
    roundsAsked: r.rounds_asked,
    askedAt: r.asked_at,
    answeredAt: r.answered_at,
  };
}

export function createCoveragePorts(input: {
  client: DeepSeekClient;
  db?: CoverageDb;
  now?: () => Date;
}): CoveragePorts {
  const db = input.db ?? (getSupabaseAdmin() as unknown as CoverageDb);
  const now = input.now ?? (() => new Date());

  async function latestQuoteId(conversationId: string): Promise<string | null> {
    const { data } = await db
      .from("prospect_quotes")
      .select("id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1);
    return data?.[0]?.id ?? null;
  }

  return {
    latestQuoteId,
    async load(conversationId) {
      const quoteId = await latestQuoteId(conversationId);
      if (quoteId === null) return null;
      const { data } = await db.from("quote_item_coverage").select("*").eq("prospect_quote_id", quoteId);
      if (data === null || data.length === 0) return null;
      return { quoteId, rows: data.map(toRow) };
    },
    async save(quoteId, conversationId, rows) {
      if (rows.length === 0) return;
      const stamp = now().toISOString();
      const { error } = await db.from("quote_item_coverage").upsert(
        rows.map((r) => ({
          prospect_quote_id: quoteId,
          conversation_id: conversationId,
          item_code: r.itemCode,
          coverage: r.coverage,
          extra_price_cents: r.extraPriceCents,
          quantity_covered: r.quantityCovered,
          evidence: r.evidence === null ? null : r.evidence.slice(0, 500),
          source: r.source,
          confidence: Math.round(r.confidence * 100) / 100,
          rounds_asked: r.roundsAsked,
          asked_at: r.askedAt,
          answered_at: r.answeredAt,
          updated_at: stamp,
        })),
        { onConflict: "prospect_quote_id,item_code" },
      );
      if (error !== null) throw new Error(`falha ao salvar cobertura (${error.code ?? "?"})`);
    },
    classify: (messages) => input.client.complete({ messages }),
    now,
  };
}
