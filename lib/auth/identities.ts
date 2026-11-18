/**
 * Regras puras de vínculo de identidades sociais. Sem I/O — testáveis em unidade.
 */

export interface IdentityLike {
  provider?: string | null;
}

/** Não dá para desvincular a última identidade de uma conta sem senha. */
export const UNLINK_LAST_IDENTITY_ERROR =
  "Não é possível desconectar a única forma de entrar. Crie uma senha primeiro.";

export function hasIdentityProvider(
  identities: ReadonlyArray<IdentityLike> | null | undefined,
  provider: string,
): boolean {
  return (identities ?? []).some((i) => i.provider === provider);
}

/**
 * Pode desvincular o provider? Precisa estar vinculado; se a conta não tem
 * senha, precisa restar ao menos uma outra identidade.
 */
export function canUnlinkIdentity(
  identities: ReadonlyArray<IdentityLike> | null | undefined,
  provider: string,
  hasPassword: boolean,
): boolean {
  const list = identities ?? [];
  if (!list.some((i) => i.provider === provider)) return false;
  if (hasPassword) return true;
  return list.some((i) => i.provider !== provider);
}
