import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { markReadBodySchema } from "@/lib/notifications/toast";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Notificações não lidas do usuário logado (RLS: somente as próprias). */
export async function GET(): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, event_id, created_at")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error !== null) {
    logger.error({ code: error.code }, "falha ao listar notificações");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ notifications: data }, { headers: { "Cache-Control": "no-store" } });
}

/** Marca como lidas (RLS permite atualizar só read_at das próprias). */
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = markReadBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", parsed.data.ids)
    .is("read_at", null);

  if (error !== null) {
    logger.error({ code: error.code }, "falha ao marcar notificações");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
