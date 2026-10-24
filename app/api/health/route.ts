import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(): NextResponse {
  return NextResponse.json({
    ok: true,
    service: "EventeIA",
    time: new Date().toISOString(),
  });
}
