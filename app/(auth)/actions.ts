"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { z } from "zod";

import { RESET_NEXT_COOKIE, buildCallbackUrl, publicOrigin } from "@/lib/auth/oauth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindWelcomeOfferToUser } from "@/lib/welcome/server";

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

  if (data.user !== null) {
    // Vincula a oferta de boas-vindas deste aparelho à nova conta (prazo original mantido).
    await bindWelcomeOfferToUser(data.user.id);
  }

  if (data.session === null) {
    return { notice: "Enviamos um link de confirmação para o seu e-mail." };
  }

  redirect("/painel");
}

/** Login/cadastro em um clique com Google (Supabase Auth OAuth, fluxo PKCE). */
export async function signInWithGoogleAction(): Promise<AuthActionState> {
  const h = await headers();
  const origin = publicOrigin(h, "http://localhost:3000");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: buildCallbackUrl(origin),
      queryParams: { prompt: "select_account" },
    },
  });

  if (error !== null || data.url === null) {
    return { error: "Não foi possível iniciar o login com Google. Tente novamente." };
  }

  redirect(data.url);
}

const resetSchema = z.object({ email: z.string().trim().email() });

/**
 * "Esqueci minha senha": funciona também para contas criadas com Google
 * (o link cria a sessão e a pessoa define uma senha em /redefinir-senha).
 * Resposta sempre neutra para não revelar se o e-mail tem conta.
 */
export async function requestPasswordResetAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Informe um e-mail válido." };

  const h = await headers();
  const origin = publicOrigin(h, "http://localhost:3000");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    // Callback sem query (bate com a allowlist exata de redirect do Supabase);
    // o destino pós-link vai num cookie curto lido pelo /auth/callback.
    redirectTo: buildCallbackUrl(origin),
  });
  (await cookies()).set(RESET_NEXT_COOKIE, "/redefinir-senha", {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/auth/callback",
    maxAge: 60 * 60,
  });

  if (error !== null && /rate limit/i.test(error.message)) {
    return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }

  return {
    notice:
      "Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira a caixa de entrada e o spam.",
  };
}
