import { NextResponse } from "next/server";

import { z } from "zod";

import { ingestBatch } from "@/lib/discovery/engine";
import { createDiscoveryDeps } from "@/lib/discovery/runtime";
import { logger } from "@/lib/logger";
import { verifyDiscoveryIngestSecret } from "@/lib/security";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.string().uuid(),
  provider: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{2,30}$/)
    .default("ingest"),
  // Cada item é validado por supplierCandidateSchema dentro do motor.
  suppliers: z.array(z.unknown()).min(1).max(100),
});

/**
 * POST /api/internal/suppliers/ingest — um agente externo empurra fornecedores
 * para um evento. Header `x-ingest-secret` (comparação em tempo constante).
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!verifyDiscoveryIngestSecret(request.headers.get("x-ingest-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  try {
    const result = await ingestBatch(createDiscoveryDeps(), parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json({ ok: true, outcomes: result.outcomes });
  } catch (caught) {
    logger.error({ reason: caught instanceof Error ? caught.message : "?" }, "falha na ingestão de fornecedores");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
