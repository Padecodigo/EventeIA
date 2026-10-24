import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/oauth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Callback do OAuth (PKCE): troca o ?code= por sessão em cookies HttpOnly e
 * garante o perfil com o e-mail do Google (usado na notificação "orçamento pronto").
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");

  if (code === null) {
    const error = searchParams.get("error") ?? "oauth";
    return NextResponse.redirect(new URL(`/entrar?erro=${encodeURIComponent(error)}`, origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error !== null || data.user === null) {
    return NextResponse.redirect(new URL("/entrar?erro=oauth", origin));
  }

  // Perfil e e-mail: o trigger handle_new_user (0021) cria/vincula o perfil com
  // nome e e-mail do Google e mantém o e-mail sincronizado — fonte confiável
  // (security definer), sem permitir que o cliente grave o próprio e-mail.
  return NextResponse.redirect(new URL(next, origin));
}
