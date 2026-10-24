import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Login de demonstração (SOMENTE LOCAL).
 * Protegido por segredo em env e pensado para abrir o dashboard já autenticado.
 * REMOVER antes de qualquer deploy público.
 *
 * Uso: /demo/entrar?secret=<DEMO_LOGIN_SECRET>&user=ana|admin
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const secret = process.env.DEMO_LOGIN_SECRET;
  const enabled = process.env.DEMO_LOGIN_ENABLED === "true";

  if (!enabled || secret === undefined || secret.length === 0 || url.searchParams.get("secret") !== secret) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isAdmin = url.searchParams.get("user") === "admin";
  const email = isAdmin ? "admin@eventeia.com" : "ana@eventeia.com";
  const password = isAdmin ? process.env.DEMO_ADMIN_PASSWORD : process.env.DEMO_ANA_PASSWORD;

  if (password === undefined || password.length === 0) {
    return new NextResponse("Demo login indisponível", { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error !== null) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.redirect(
    new URL(isAdmin ? "/admin/depoimentos" : "/painel", url.origin),
  );
}
