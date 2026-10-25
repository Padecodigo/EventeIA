import { NextResponse, type NextRequest } from "next/server";

import { searchMunicipios } from "@/lib/geo/municipios";

export const runtime = "nodejs";

/** Autocomplete de municípios (dados públicos do IBGE, snapshot local). */
export function GET(request: NextRequest): NextResponse {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const results = searchMunicipios(q, 12);
  return NextResponse.json(
    { results },
    { headers: { "cache-control": "public, max-age=86400, s-maxage=86400" } },
  );
}
