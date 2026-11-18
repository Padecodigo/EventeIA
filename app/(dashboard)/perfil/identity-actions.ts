"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  UNLINK_LAST_IDENTITY_ERROR,
  canUnlinkIdentity,
  hasIdentityProvider,
} from "@/lib/auth/identities";
import { RESET_NEXT_COOKIE, buildCallbackUrl, publicOrigin } from "@/lib/auth/oauth";
import { accountHasPassword } from "@/lib/auth/password-server";
import { isFacebookLoginEnabled } from "@/lib/auth/social-flags";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface IdentityActionState {
  error?: string;
  notice?: string;
}

/**
 * Vincula o Facebook à conta logada (linkIdentity). Depois do callback,
 * o usuário volta ao /perfil via cookie (sem ?next= na allowlist).
 */
export async function linkFacebookAction(
  _previous?: IdentityActionState,
  _formData?: FormData,
): Promise<IdentityActionState> {
  if (!isFacebookLoginEnabled()) {
    return { error: "A conexão com o Facebook não está disponível no momento." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: current, error: userError } = await supabase.auth.getUser();
  if (userError !== null || current.user === null) {
    return { error: "Entre novamente para conectar o Facebook." };
  }
  if (hasIdentityProvider(current.user.identities, "facebook")) {
    return { notice: "O Facebook já está conectado a esta conta." };
  }

  const h = await headers();
  const origin = publicOrigin(h, "http://localhost:3000");
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "facebook",
    options: {
      redirectTo: buildCallbackUrl(origin),
      scopes: "public_profile,email",
    },
  });

  if (error !== null || data.url === null || data.url === undefined) {
    return { error: "Não foi possível iniciar a conexão com o Facebook. Tente novamente." };
  }

  (await cookies()).set(RESET_NEXT_COOKIE, "/perfil", {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/auth/callback",
    maxAge: 60 * 60,
  });

  redirect(data.url);
}

/**
 * Desvincula o Facebook. Recusa se for a última identidade de uma conta sem senha.
 */
export async function unlinkFacebookAction(
  _previous?: IdentityActionState,
  _formData?: FormData,
): Promise<IdentityActionState> {
  if (!isFacebookLoginEnabled()) {
    return { error: "A conexão com o Facebook não está disponível no momento." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: current, error: userError } = await supabase.auth.getUser();
  if (userError !== null || current.user === null) {
    return { error: "Entre novamente para desconectar o Facebook." };
  }

  const identities = current.user.identities ?? [];
  const facebook = identities.find((i) => i.provider === "facebook");
  if (facebook === undefined) {
    return { error: "O Facebook não está conectado a esta conta." };
  }

  const hasPassword = await accountHasPassword(current.user);
  if (!canUnlinkIdentity(identities, "facebook", hasPassword)) {
    return { error: UNLINK_LAST_IDENTITY_ERROR };
  }

  const { error } = await supabase.auth.unlinkIdentity(facebook);
  if (error !== null) {
    return { error: "Não foi possível desconectar o Facebook. Tente novamente." };
  }

  revalidatePath("/perfil");
  return { notice: "Facebook desconectado." };
}
