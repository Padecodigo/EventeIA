/**
 * Flags públicas de login social (NEXT_PUBLIC_*). Default: desligado.
 * Valores aceitos como ligado: 1, true, yes, on (qualquer capitalização).
 */
export function isEnvFlagEnabled(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isFacebookLoginEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isEnvFlagEnabled(env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED);
}

/**
 * Reservada. Instagram Login ainda não é provider nativo do Supabase e
 * este app não implementa OAuth custom. A flag não habilita login.
 */
export function isInstagramLoginEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isEnvFlagEnabled(env.NEXT_PUBLIC_INSTAGRAM_LOGIN_ENABLED);
}
