import { NextResponse } from "next/server";

import { centsToCsv, toCsv } from "@/lib/export/csv";
import { loadUsage } from "@/lib/usage/load";
import { matchesFilters, parseUsageFilters } from "@/lib/usage/report";

export const dynamic = "force-dynamic";

/** CSV linha a linha do consumo de LLM com os mesmos filtros da página. Somente admin (loadUsage). */
export async function GET(req: Request) {
  const filters = parseUsageFilters(new URL(req.url).searchParams);
  const data = await loadUsage(filters);
  const rows = data.rows
    .filter((r) => matchesFilters(r, filters))
    .map((r) => [
      r.at, r.provider, r.task, r.outcome, r.stage, r.channel, r.profileId, r.eventId,
      r.inputTokens, r.outputTokens, r.costMicroUsd, centsToCsv(r.costBrlCents),
    ]);
  const csv = toCsv(
    ["data_utc", "provedor", "operacao", "resultado", "estagio", "canal_whatsapp", "usuario_id", "evento_id", "tokens_in", "tokens_out", "custo_micro_usd", "custo_brl"],
    rows,
  );
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="consumo-${filters.from}_${filters.to}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
