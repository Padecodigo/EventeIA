import "server-only";

import { redirect } from "next/navigation";

import { isAdminRole } from "./admin/nav";
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

/**
 * Para /entrar e /registrar: quem já tem sessão vai direto ao painel em vez de
 * ver o formulário de login de novo.
 */
export async function redirectIfSignedIn(): Promise<void> {
  const user = await getSessionUser();
  if (user !== null) {
    redirect("/painel");
  }
}

/** Verdadeiro quando o usuário tem profiles.role = 'admin' (superusuário). Nunca lança. */
export async function isAdminUser(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient().catch(() => null);
  if (supabase === null) {
    return false;
  }
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return isAdminRole(data?.role);
}

/** Garante sessão + papel admin; caso contrário volta ao painel. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await isAdminUser(user.id))) {
    redirect("/painel");
  }
  return user;
}
