import { NextResponse } from "next/server";

import { scenarioCsv } from "@/lib/quotes/export";

import { loadScenario } from "../load";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; cenario: string }> }) {
  const { id, cenario } = await params;
  const data = await loadScenario(id, cenario);
  if (data === null) return new NextResponse("Não encontrado", { status: 404 });
  return new NextResponse(scenarioCsv(data.snap), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orcamento-${cenario}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
