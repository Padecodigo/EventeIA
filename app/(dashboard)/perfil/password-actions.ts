"use server";

import { revalidatePath } from "next/cache";

import {
  friendlyPasswordError,
  needsReauthentication,
  passwordSavedMessage,
  validateNewPassword,
} from "@/lib/auth/password";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

export interface PasswordState {
  error?: string;
  success?: string;
  /** Supabase pediu reautenticação: mostrar campo do código enviado por e-mail. */
  needsNonce?: boolean;
}

/**
 * Cria ou altera a senha do usuário logado (inclusive contas criadas com Google).
 * Mesmo usuário do Supabase Auth: depois disso ele entra com Google OU e-mail+senha.
 */
export async function setPasswordAction(
  _previous: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");
  const nonce = field(formData, "nonce").trim();

  const invalid = validateNewPassword(password, confirm);
  if (invalid !== null) return { error: invalid, needsNonce: nonce.length > 0 || undefined };

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase.auth.getUser();
  if (!current?.user) return { error: "Sua sessão expirou. Entre novamente." };

  const { error } = await supabase.auth.updateUser(
    nonce.length > 0 ? { password, nonce } : { password },
  );

  if (error !== null) {
    if (nonce.length === 0 && needsReauthentication(error)) {
      const { error: reauthError } = await supabase.auth.reauthenticate();
      if (reauthError !== null) return { error: friendlyPasswordError(reauthError) };
      return {
        needsNonce: true,
        error:
          "Por segurança, enviamos um código para o seu e-mail. Digite-o abaixo para confirmar.",
      };
    }
    return { error: friendlyPasswordError(error), needsNonce: nonce.length > 0 || undefined };
  }

  try {
    await getSupabaseAdmin().auth.admin.updateUserById(current.user.id, {
      app_metadata: { has_password: true },
    });
  } catch (caught) {
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "marca has_password falhou",
    );
  }

  revalidatePath("/perfil");
  return {
    success: passwordSavedMessage(current.user),
  };
}
