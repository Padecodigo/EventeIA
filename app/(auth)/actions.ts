"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { z } from "zod";

import { recordAnalytics } from "@/lib/analytics/server";
import { RESET_NEXT_COOKIE, buildCallbackUrl, publicOrigin } from "@/lib/auth/oauth";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session-ttl";
import { normalizeInstagramHandle } from "@/lib/instagram-handle";
import { recordTermsAcceptance } from "@/lib/legal/acceptance-server";
import { TERMS_COOKIE, TERMS_ERROR, TERMS_VERSION, hasAcceptedTerms } from "@/lib/legal/terms";
import { logger } from "@/lib/logger";
import { normalizePhoneE164 } from "@/lib/phone";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error !== null) {
    return { error: friendlyAuthError(error.message) };
  }

  await recordAnalytics({ event: "login", profileId: data.user?.id ?? null });
  (await cookies()).set(SESSION_COOKIE, String(Date.now()), SESSION_COOKIE_OPTIONS);
  redirect("/painel");
}

const signUpSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8),
  whatsapp: z.string().trim().optional(),
  instagram: z.string().trim().optional(),
});

export async function signUpAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    whatsapp: formData.get("whatsapp") ?? "",
    instagram: formData.get("instagram") ?? "",
  });

  if (!parsed.success) {
    return { error: "Confira nome, e-mail e senha (mínimo de 8 caracteres)." };
  }

  if (!hasAcceptedTerms(formData)) {
    return { error: TERMS_ERROR };
  }

  const whatsappRaw = parsed.data.whatsapp ?? "";
  const whatsappE164 = whatsappRaw.length === 0 ? null : normalizePhoneE164(whatsappRaw);
  if (whatsappRaw.length > 0 && whatsappE164 === null) {
    return { error: "WhatsApp inválido. Use DDD + número (ex.: 11 99999-9999)." };
  }

  const instagramRaw = parsed.data.instagram ?? "";
  const instagramHandle =
    instagramRaw.length === 0 ? null : normalizeInstagramHandle(instagramRaw);
  if (instagramRaw.length > 0 && instagramHandle === null) {
    return {
      error: "Instagram inválido. Use apenas letras, números, ponto e underscore (ex.: @seu.perfil).",
    };
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
    await recordAnalytics({ event: "signup", profileId: data.user.id });
    // Vincula a oferta de boas-vindas deste aparelho à nova conta (prazo original mantido).
    await bindWelcomeOfferToUser(data.user.id);
    // Prova do aceite: data/hora + versão dos termos (0041).
    await recordTermsAcceptance(data.user.id, "signup");

    if (whatsappE164 !== null || instagramHandle !== null) {
      try {
        const admin = getSupabaseAdmin();
        await admin
          .from("profiles")
          .update({
            contact_whatsapp_e164: whatsappE164,
            instagram_handle: instagramHandle,
          })
          .eq("id", data.user.id);
      } catch (caught) {
        logger.warn(
          { reason: caught instanceof Error ? caught.message : "desconhecido" },
          "falha ao gravar contatos opcionais no cadastro",
        );
      }
    }
  }

  if (data.session === null) {
    return { notice: "Enviamos um link de confirmação para o seu e-mail." };
  }

  redirect("/painel");
}

/**
 * Login/cadastro em um clique com Google (Supabase Auth OAuth, fluxo PKCE).
 * No cadastro (intent=signup) o aceite dos termos é obrigatório e segue num
 * cookie curto até o /auth/callback, onde é registrado para a conta.
 */
export async function signInWithGoogleAction(
  _previous?: AuthActionState,
  formData?: FormData,
): Promise<AuthActionState> {
  const isSignUp = formData?.get("intent") === "signup";
  if (isSignUp && !hasAcceptedTerms(formData)) {
    return { error: TERMS_ERROR };
  }

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

  if (isSignUp) {
    (await cookies()).set(TERMS_COOKIE, TERMS_VERSION, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/auth/callback",
      maxAge: 60 * 60,
    });
  }

  redirect(data.url);
}

const idTokenSchema = z.object({
  credential: z.string().min(20).max(8192),
  nonce: z.string().regex(/^[0-9a-f]{64}$/),
  intent: z.enum(["signin", "signup"]),
  acceptedTerms: z.boolean(),
});

/**
 * Login/cadastro com o botão oficial do Google (Google Identity Services):
 * troca o ID token do Google por uma sessão do Supabase. O nonce cru vai para
 * o Supabase; o Google recebeu o hash SHA-256 dele.
 */
export async function signInWithGoogleIdTokenAction(input: {
  credential: string;
  nonce: string;
  intent: "signin" | "signup";
  acceptedTerms: boolean;
}): Promise<AuthActionState & { redirectTo?: string }> {
  const parsed = idTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Não foi possível entrar com Google. Tente novamente." };
  }
  const { credential, nonce, intent, acceptedTerms } = parsed.data;
  if (intent === "signup" && !acceptedTerms) {
    return { error: TERMS_ERROR };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
    nonce,
  });
  if (error !== null || data.user === null) {
    return { error: "Não foi possível entrar com Google. Tente novamente." };
  }

  // Mesmo pós-login do /auth/callback: oferta de boas-vindas, aceite dos termos e marca de sessão.
  await bindWelcomeOfferToUser(data.user.id);
  if (intent === "signup") {
    await recordTermsAcceptance(data.user.id, "signup");
  }
  (await cookies()).set(SESSION_COOKIE, String(Date.now()), SESSION_COOKIE_OPTIONS);
  return { redirectTo: "/painel" };
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
