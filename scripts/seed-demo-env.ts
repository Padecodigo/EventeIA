export interface SeedPasswords {
  demoPassword: string;
  adminPassword: string;
}

const MIN_PASSWORD_LENGTH = 12;

/**
 * Lê as senhas de demonstração a partir do ambiente (pura, sem I/O).
 * Lança erro se alguma senha estiver ausente ou tiver menos de 12 caracteres.
 */
export function readSeedPasswords(env: Record<string, string | undefined>): SeedPasswords {
  const demoPassword = env.DEMO_SEED_PASSWORD;
  const adminPassword = env.DEMO_SEED_ADMIN_PASSWORD;

  if (demoPassword === undefined || demoPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `DEMO_SEED_PASSWORD é obrigatória e deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }

  if (adminPassword === undefined || adminPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `DEMO_SEED_ADMIN_PASSWORD é obrigatória e deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }

  return { demoPassword, adminPassword };
}
