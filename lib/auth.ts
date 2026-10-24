import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "./supabase/server";

export interface SessionUser {
  id: string;
  email?: string;
}

/** Retorna o usuário autenticado (ou null), sem redirecionar. */
async function getSessionUser(): Promise<SessionUser | null> {
  // Ambiente sem Supabase configurado: trata como não autenticado (redireciona),
  // em vez de quebrar a rota protegida com 500.
  const supabase = await createSupabaseServerClient().catch(() => null);
  if (supabase === null) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error !== null || data.user === null) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
  };
}

/** Garante sessão; redireciona para /entrar quando ausente. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user === null) {
    redirect("/entrar");
  }
  return user;
}

/** Garante sessão + papel admin; caso contrário volta ao painel. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient().catch(() => null);

  if (supabase === null) {
    redirect("/painel");
  }

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (data?.role !== "admin") {
    redirect("/painel");
  }

  return user;
}
