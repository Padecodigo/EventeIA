/** Regras de validade da arte em cache (puras, sem I/O). */

/** A arte fica disponível para reposts por 1 hora. */
export const ART_TTL_MS = 60 * 60 * 1000;

export function artExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + ART_TTL_MS);
}

export function isArtExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt === null || expiresAt.getTime() <= now.getTime();
}
