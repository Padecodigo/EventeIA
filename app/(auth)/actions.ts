"use server";

import { redirect } from "next/navigation";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthActionState {
  error?: string;
  notice?: string;
}

/**
 * Login/cadastro 100% no servidor (server actions): o navegador não fala
 * diretamente com o Supabase — imune a CORS, proxy de rede e abas com cache
 * antigo. A sessão é gravada em cookies HttpOnly pelo cliente SSR.
 */

function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("invalid login")) {
    return "E-mail ou senha incorretos.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirme o seu e-mail antes de entrar.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "Este e-mail já tem uma conta. Tente entrar.";
  }
  if (lower.includes("password")) {
    return "A senha precisa ter ao menos 8 caracteres.";
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("econnrefused")) {
    return "Não foi possível falar com o servidor de autenticação. Verifique se o Supabase local está no ar (npx supabase start).";
  }
  return message;
}

const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Informe um e-mail válido e uma senha com ao menos 8 caracteres." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error !== null) {
    return { error: friendlyAuthError(error.message) };
  }

  redirect("/painel");
}

const signUpSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export async function signUpAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Confira nome, e-mail e senha (mínimo de 8 caracteres)." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error !== null) {
    return { error: friendlyAuthError(error.message) };
  }

  if (data.session === null) {
    return { notice: "Enviamos um link de confirmação para o seu e-mail." };
  }

  redirect("/painel");
}
