import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAnalytics } from "@/lib/analytics/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  path: z.string().trim().min(1).max(300),
  sessionId: z.string().trim().min(8).max(64).optional(),
});

/** Beacon de visualização de página (client → server). */
export async function POST(request: Request): Promise<NextResponse> {
  const json: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const path = parsed.data.path;
  if (path.startsWith("/admin") || path.startsWith("/api")) {
    return NextResponse.json({ ok: true });
  }

  await recordAnalytics({
    event: "page_view",
    path,
    sessionId: parsed.data.sessionId ?? null,
  });
  return NextResponse.json({ ok: true });
}
