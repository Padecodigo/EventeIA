import pino from "pino";

/**
 * Logger estruturado (JSON). Logs NÃO substituem feeds de negócio
 * (ver .context/FEEDS.md) e nunca contêm PII/segredos (SECURITY.md §8).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "EventeIA" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
