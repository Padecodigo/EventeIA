/**
 * Regras puras de senha (criar/alterar/redefinir). Sem dependências de servidor.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordStrength = "fraca" | "média" | "forte";

/** Dica de força: comprimento + variedade (minúsculas, maiúsculas, dígitos, símbolos). */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN_LENGTH) return "fraca";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  const score = classes + (password.length >= 12 ? 1 : 0);
  if (score >= 4) return "forte";
  if (score >= 2) return "média";
  return "fraca";
}

/** Valida senha + confirmação; devolve mensagem em português ou null. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (password !== confirm) return "As senhas não conferem.";
  return null;
}

export interface AuthErrorLike {
  message?: string;
  code?: string;
}

/** O Supabase exige reautenticação (secure_password_change / sessão antiga). */
export function needsReauthentication(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "reauthentication_needed" ||
    code === "reauthentication_not_valid" ||
    msg.includes("reauthentication")
  );
}

export function friendlyPasswordError(error: AuthErrorLike): string {
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();
  if (
    code === "reauthentication_not_valid" ||
    msg.includes("invalid nonce") ||
    msg.includes("nonce")
  ) {
    return "Código de verificação inválido ou expirado. Peça um novo código.";
  }
  if (code === "same_password" || msg.includes("different from the old")) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (code === "weak_password" || msg.includes("weak") || msg.includes("password should")) {
    return "Senha fraca demais. Use ao menos 8 caracteres, misturando letras e números.";
  }
  if (msg.includes("rate limit") || code === "over_email_send_rate_limit") {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  return "Não foi possível salvar a senha. Tente novamente.";
}

interface UserLike {
  identities?: { provider?: string }[] | null;
  app_metadata?: Record<string, unknown> | null;
}

/** Usuário já tem senha? (identidade "email" ou marca gravada ao criar a senha). */
export function userHasPassword(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  if (user.app_metadata?.has_password === true) return true;
  return (user.identities ?? []).some((i) => i.provider === "email");
}
