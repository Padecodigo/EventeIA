import pino from "pino";

import { redactSecrets } from "./security";

const SECRET_KEYS = ["token", "apikey", "authorization", "x-evolution-token", "secret", "password"];

/** Mascara segredos em campos conhecidos e em query strings dentro de strings. */
export function scrubLogFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_KEYS.includes(key.toLowerCase())) out[key] = "[REDACTED]";
    else if (typeof value === "string") out[key] = redactSecrets(value);
    else out[key] = value;
  }
  return out;
}

/**
 * Logger estruturado (JSON). Logs NÃO substituem feeds de negócio
 * (ver .context/FEEDS.md) e nunca contêm PII/segredos (SECURITY.md §8).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "EventeIA" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { log: scrubLogFields },
  hooks: {
    logMethod(args, method) {
      method.apply(this, args.map((a) => (typeof a === "string" ? redactSecrets(a) : a)) as Parameters<typeof method>);
    },
  },
});
