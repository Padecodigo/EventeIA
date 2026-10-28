import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** WhatsApp/Evolution removidos: endpoint desativado responde 410 sem processar. */
export function GET(): NextResponse {
  return NextResponse.json({ error: "gone" }, { status: 410 });
}

export function POST(): NextResponse {
  return NextResponse.json({ error: "gone" }, { status: 410 });
}
