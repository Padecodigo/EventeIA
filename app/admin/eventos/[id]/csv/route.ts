import { NextResponse } from "next/server";

import { eventCostCsv } from "@/lib/admin/event-csv";
import { loadEventCost } from "@/lib/admin/event-finance";
import { isUuid } from "@/lib/admin/search";
import { requireAdmin } from "@/lib/auth";
import { PROVIDER_LABELS } from "@/lib/finance/load";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** CSV do evento: custos por ferramenta, receita e margem. Somente admin. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse("evento inválido", { status: 400 });
  const { data: ev } = await getSupabaseAdmin().from("events").select("id,title").eq("id", id).maybeSingle();
  if (!ev) return new NextResponse("evento não encontrado", { status: 404 });
  const cost = await loadEventCost(id, ev.title);
  return new NextResponse(eventCostCsv(cost, PROVIDER_LABELS), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="evento-${id.slice(0, 8)}-custos.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
