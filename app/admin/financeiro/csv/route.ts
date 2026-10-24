import { NextResponse } from "next/server";

import { centsToCsv, toCsv } from "@/lib/export/csv";
import { loadFinance, PROVIDER_LABELS } from "@/lib/finance/load";
import { resolvePeriod } from "@/lib/finance/report";

export const dynamic = "force-dynamic";

/** CSV detalhado (custos + receitas) do período. Somente admin (loadFinance → requireAdmin + RLS). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const period = resolvePeriod(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
  const data = await loadFinance(period);
  const rows = [
    ...data.costs.map((c) => [
      c.at, "custo", PROVIDER_LABELS[c.provider] ?? c.provider, c.reason, c.kind, c.eventId, data.eventTitles[c.eventId ?? ""] ?? null,
      c.inputTokens, c.outputTokens, c.costMicroUsd, `-${centsToCsv(c.costBrlCents)}`, null, null, c.detail,
    ]),
    ...data.revenue.map((r) => [
      r.at, "receita", "Asaas", r.plan, r.status, r.eventId, r.clientLabel,
      null, null, null, centsToCsv(r.refunded ? 0 : r.netCents), centsToCsv(r.grossCents), centsToCsv(r.feeCents), r.refunded ? "estornado" : "",
    ]),
  ];
  const csv = toCsv(
    ["data_utc", "tipo", "provedor", "motivo_plano", "categoria_status", "evento_id", "evento_cliente", "tokens_in", "tokens_out", "custo_micro_usd", "valor_brl", "bruto_brl", "taxa_asaas_brl", "detalhe"],
    rows,
  );
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="financeiro-${period.from}_${period.to}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
