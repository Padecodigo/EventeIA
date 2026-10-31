import { NextResponse } from "next/server";

import { ARCHIVED_COST_COLUMNS, archivedCostsCsv } from "@/lib/admin/archive";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** CSV fiscal dos custos no arquivo morto. Somente admin. */
export async function GET() {
  await requireAdmin();
  const { data, error } = await getSupabaseAdmin()
    .from("cost_entries").select(ARCHIVED_COST_COLUMNS).not("archived_at", "is", null)
    .order("occurred_at", { ascending: true }).limit(50_000);
  if (error) return new NextResponse("Falha ao gerar o CSV.", { status: 500 });
  const csv = archivedCostsCsv(data ?? []);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="arquivo-morto-custos-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
