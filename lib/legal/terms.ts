/** Versão vigente dos Termos de Uso e da Política de Privacidade (data de vigência). */
export const TERMS_VERSION = "2026-10-25";
export const TERMS_EFFECTIVE_DATE_LABEL = "25/10/2026";

/** Campo do formulário com a checkbox de aceite. */
export const TERMS_FIELD = "acceptTerms";

/** Cookie curto que leva o aceite do cadastro com Google até o /auth/callback. */
export const TERMS_COOKIE = "eventeia_terms_accept";

export const TERMS_ERROR =
  "Para continuar, marque que leu e aceita os Termos de Uso e a Política de Privacidade.";

export type TermsContext = "signup" | "checkout";

/** Aceite validado no servidor: a checkbox precisa ter sido marcada ("on"). */
export function hasAcceptedTerms(formData: FormData | undefined | null): boolean {
  if (formData === undefined || formData === null) return false;
  const value = formData.get(TERMS_FIELD);
  return value === "on" || value === "yes" || value === "true";
}

/** Valor do cookie do aceite (só a versão vigente vale). */
export function isCurrentTermsCookie(value: string | undefined): boolean {
  return value === TERMS_VERSION;
}
