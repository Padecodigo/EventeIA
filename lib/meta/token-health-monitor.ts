import "server-only";

import { serverEnv } from "@/lib/env";
import { DEFAULT_ALERT_EMAIL } from "@/lib/finance/balance-monitor";
import { logger } from "@/lib/logger";
import { getEmailAdapter } from "@/lib/notifications/email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { checkMetaToken, type MetaTokenHealth } from "./token-health";

/**
 * Cheque diário de saúde do token da Meta (worker `meta-token-health`).
 *
 * Grava o estado em `meta_token_status` (histórico auditável) e, quando o token
 * está inválido ou faltam escopos obrigatórios, gera alerta no `finance_alerts`
 * (banner/painel de custos) e envia e-mail — no máximo 1 e-mail por 24h, como a
 * lógica de `last_alert_at` do cheque de saldos.
 */

export type MetaTokenCheckStatus = "ok" | "not_configured" | "invalid" | "missing_scopes" | "graph_error";

const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface MetaTokenHealthCheckResult {
  status: MetaTokenCheckStatus;
  emailed: boolean;
}

function metaTokenAlertEmailText(health: MetaTokenHealth): string {
  const lines = [`Válido: ${health.isValid ? "sim" : "não"}`];
  lines.push(health.expiresAt === null ? "Expira em: nunca expira" : `Expira em: ${new Date(health.expiresAt).toISOString()}`);
  if (health.missingScopes.length > 0) {
    lines.push(`Escopos obrigatórios faltando: ${health.missingScopes.join(", ")}`);
  }
  if (health.optionalMissing.length > 0) {
    lines.push(`Escopos opcionais faltando: ${health.optionalMissing.join(", ")}`);
  }
  if (health.error !== undefined) {
    lines.push(`Erro: ${health.error}`);
  }
  return `Atenção: o token da Meta precisa de atenção.\n\n${lines.join("\n")}\n\nVerifique o painel: https://eventeia.com.br/admin/custos`;
}

function statusOf(health: MetaTokenHealth): MetaTokenCheckStatus {
  if (health.error !== undefined) return "graph_error";
  if (!health.isValid) return "invalid";
  if (health.missingScopes.length > 0) return "missing_scopes";
  return "ok";
}

export async function runMetaTokenHealthCheck(
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<MetaTokenHealthCheckResult> {
  const admin = getSupabaseAdmin();
  const now = opts.now ?? new Date();
  const env = serverEnv();
  const token = env.META_ACCESS_TOKEN;
  const apiVersion = env.META_API_VERSION;

  if (token === undefined || token.length === 0) {
    await admin.from("meta_token_status").insert({
      is_valid: false,
      scopes: [],
      missing_scopes: [],
      optional_missing: [],
      error: "META_ACCESS_TOKEN não configurado",
    });
    return { status: "not_configured", emailed: false };
  }

  const health = await checkMetaToken({ accessToken: token, apiVersion, fetchImpl: opts.fetchImpl });
  const status = statusOf(health);

  await admin.from("meta_token_status").insert({
    is_valid: health.isValid,
    expires_at: health.expiresAt,
    scopes: health.scopes,
    missing_scopes: health.missingScopes,
    optional_missing: health.optionalMissing,
    error: health.error ?? null,
  });

  const problem = status !== "ok";
  if (!problem) return { status, emailed: false };

  // Dedupe: no máximo 1 alerta/e-mail por 24h para o mesmo problema.
  const { data: recent } = await admin
    .from("finance_alerts")
    .select("created_at")
    .eq("kind", "meta_token")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = recent?.[0]?.created_at;
  if (latest !== undefined && now.getTime() - Date.parse(latest) < ALERT_COOLDOWN_MS) {
    return { status, emailed: false };
  }

  let emailed = false;
  try {
    await getEmailAdapter().send({
      to: process.env.FINANCE_ALERT_EMAIL || DEFAULT_ALERT_EMAIL,
      subject: "EventeIA: problema no token da Meta",
      text: metaTokenAlertEmailText(health),
    });
    emailed = true;
  } catch (error) {
    logger.warn({ reason: error instanceof Error ? error.message : "?" }, "falha no e-mail de alerta do token Meta");
  }

  await admin.from("finance_alerts").insert({
    provider: "meta",
    kind: "meta_token",
    balance_brl_cents: null,
    runway_days: null,
    emailed,
  });

  logger.info({ status, emailed }, "cheque de saúde do token Meta concluído");
  return { status, emailed };
}
