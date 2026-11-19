"use server";

import { cookies, headers } from "next/headers";

import { z } from "zod";

import { RESET_NEXT_COOKIE, buildCallbackUrl, publicOrigin } from "@/lib/auth/oauth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface EmailChangeState {
  error?: string;
  success?: string;
}

const emailSchema = z.object({
  email: z.string().trim().email(),
});

function friendlyEmailChangeError(error: {
  message?: string;
  code?: string;
  status?: number;
}): string {
  const msg = (error.message ?? "").toLowerCase();
  const code = String(error.code ?? "").toLowerCase();
  const status = error.status ?? 0;
  if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
    return "Este e-mail já tem uma conta.";
  }
  if (status === 429 || msg.includes("rate limit") || code === "over_email_send_rate_limit") {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (status === 401 || msg.includes("session") || msg.includes("jwt")) {
    return "Sua sessão expirou. Entre novamente.";
  }
  return "Não foi possível iniciar a troca de e-mail. Tente novamente.";
}

/**
 * Solicita a troca do e-mail de acesso. O Supabase envia a confirmação para o
 * e-mail novo; profiles.email só é atualizado pelo trigger sync_profile_email
 * depois da confirmação (o cliente não grava esse campo).
 */
export async function changeEmailAction(
  _previous: EmailChangeState,
  formData: FormData,
): Promise<EmailChangeState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Informe um e-mail válido." };
  }
  const newEmail = parsed.data.email.toLowerCase();

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase.auth.getUser();
  if (!current?.user) return { error: "Sua sessão expirou. Entre novamente." };

  if ((current.user.email ?? "").toLowerCase() === newEmail) {
    return { error: "O novo e-mail é igual ao atual." };
  }

  const h = await headers();
  const origin = publicOrigin(h, "http://localhost:3000");
  (await cookies()).set(RESET_NEXT_COOKIE, "/perfil", {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/auth/callback",
    maxAge: 60 * 60,
  });

  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: buildCallbackUrl(origin) },
  );

  if (error !== null) {
    return { error: friendlyEmailChangeError(error) };
  }

  return { success: "Enviamos um link de confirmação para o novo e-mail." };
}
