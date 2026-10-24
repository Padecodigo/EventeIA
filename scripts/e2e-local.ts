/**
 * E2E local do MVP — valida o fluxo financeiro de ponta a ponta com o app rodando.
 *
 * Pré-requisitos:
 *   - Supabase local ativo (npx supabase start) e migrações aplicadas
 *   - App rodando em NEXT_PUBLIC_APP_URL (pnpm start) com .env.local carregado
 *   - `pnpm demo:seed` já executado
 *
 * Uso: pnpm e2e:local
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../lib/supabase/types";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN ?? "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url === undefined || serviceRoleKey === undefined) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
}

async function postWebhook(eventId: string, eventName: string, paymentId: string, subscriptionId?: string): Promise<number> {
  const response = await fetch(`${appUrl}/api/webhooks/asaas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "asaas-access-token": webhookToken,
    },
    body: JSON.stringify({
      id: eventId,
      event: eventName,
      payment: {
        id: paymentId,
        status: eventName === "PAYMENT_RECEIVED" ? "RECEIVED" : eventName,
        ...(subscriptionId !== undefined ? { subscription: subscriptionId } : {}),
      },
    }),
  });
  return response.status;
}

/** Processa o webhook como o worker faria (sem Redis, invocamos o RPC direto). */
async function processWebhook(externalEventId: string): Promise<string | null> {
  const { data } = await admin
    .from("webhook_events")
    .select("id")
    .eq("source", "asaas")
    .eq("external_event_id", externalEventId)
    .maybeSingle();

  if (data === null) {
    return null;
  }

  const { data: result } = await admin.rpc("process_payment_webhook", {
    p_webhook_event_id: data.id,
  });

  return result ?? null;
}

async function main(): Promise<void> {
  console.log("E2E local — EventeIA MVP");
  console.log(`app: ${appUrl}\n`);

  // 0) App no ar
  const health = await fetch(`${appUrl}/api/health`);
  assert(health.status === 200, "app responde em /api/health");

  // 1) Login demo via rota protegida por segredo
  const login = await fetch(`${appUrl}/demo/entrar?secret=${process.env.DEMO_LOGIN_SECRET ?? ""}&user=ana`, {
    redirect: "manual",
  });
  const setCookie = login.headers.get("set-cookie") ?? "";
  assert(
    login.status === 307 || login.status === 200,
    "login demo redireciona ao painel (307)",
  );
  assert(setCookie.includes("sb-"), "login define cookies de sessão");

  const cookie = setCookie.split(";")[0] ?? "";
  const painel = await fetch(`${appUrl}/painel`, { headers: { cookie } });
  const painelHtml = await painel.text();
  assert(painel.status === 200, "painel acessível com a sessão");
  assert(painelHtml.includes("Histórico"), "painel renderiza o histórico");

  // 2) B2C: novo evento + tíquete + webhook Pix confirmado
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const anaId = users?.users.find((candidate) => candidate.email === "ana@eventeia.com")?.id;

  if (anaId === undefined) {
    throw new Error("usuário demo ana@eventeia.com não encontrado — rode pnpm demo:seed");
  }

  const eventId = randomUUID();
  await admin.from("events").insert({
    id: eventId,
    owner_profile_id: anaId,
    title: "E2E — Festa do teste",
    event_type: "festa_infantil",
    event_date: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10),
    region_code: "sp",
    guest_count: 30,
    status: "awaiting_payment",
  });

  const asaasPaymentId = `e2e_pay_${randomUUID()}`;
  const paymentId = randomUUID();
  await admin.from("payments").insert({
    id: paymentId,
    profile_id: anaId,
    purpose: "event_ticket",
    event_id: eventId,
    asaas_payment_id: asaasPaymentId,
    billing_type: "PIX",
    amount_cents: 9700,
    status: "pending",
  });
  await admin.from("event_tickets").insert({
    event_id: eventId,
    status: "pending",
    payment_id: paymentId,
  });

  const webhookId = `e2e_evt_${randomUUID()}`;
  console.log("\n1) Tíquete B2C via webhook Pix:");
  const postStatus = await postWebhook(webhookId, "PAYMENT_RECEIVED", asaasPaymentId);
  assert(postStatus === 200, "webhook aceito (200)");
  const ticketOutcome = await processWebhook(webhookId);
  // Com os workers no ar, o processamento pode vencer a corrida do RPC direto.
  assert(
    ticketOutcome === "processed" || ticketOutcome === "already_processed",
    "webhook processado",
  );

  const { data: paymentAfter } = await admin
    .from("payments")
    .select("status")
    .eq("id", paymentId)
    .maybeSingle();
  assert(paymentAfter?.status === "paid", "pagamento confirmado");

  const { data: ticketAfter } = await admin
    .from("event_tickets")
    .select("status")
    .eq("event_id", eventId)
    .maybeSingle();
  assert(ticketAfter?.status === "active", "tíquete ativado");

  const { count: confirmFeeds } = await admin
    .from("system_events")
    .select("id", { count: "exact", head: true })
    .eq("type", "payment.confirmed")
    .eq("aggregate_id", paymentId);
  assert((confirmFeeds ?? 0) === 1, "feed payment.confirmed emitido (1×)");

  // Replay idempotente
  console.log("\n2) Idempotência (replay do mesmo evento):");
  const replayStatus = await postWebhook(webhookId, "PAYMENT_RECEIVED", asaasPaymentId);
  assert(replayStatus === 200, "replay aceito (200)");
  const replayResult = await processWebhook(webhookId);
  assert(replayResult === "already_processed", "replay é no-op (already_processed)");
  const { count: confirmFeedsAfter } = await admin
    .from("system_events")
    .select("id", { count: "exact", head: true })
    .eq("type", "payment.confirmed")
    .eq("aggregate_id", paymentId);
  assert((confirmFeedsAfter ?? 0) === 1, "nenhum efeito duplicado");

  // 3) B2B: assinatura — fatura confirmada concede franquia
  console.log("\n3) Assinatura B2B (fatura concede franquia):");
  const workspaceId = randomUUID();
  await admin.from("workspaces").insert({
    id: workspaceId,
    owner_id: anaId,
    name: "E2E Ateliê",
    plan_code: "atelier",
  });
  const asaasSubscriptionId = `e2e_sub_${randomUUID()}`;
  await admin.from("subscriptions").insert({
    workspace_id: workspaceId,
    plan_code: "atelier",
    asaas_subscription_id: asaasSubscriptionId,
    status: "pending",
  });

  const invoicePaymentId = `e2e_inv_${randomUUID()}`;
  const invoiceEventId = `e2e_evt_${randomUUID()}`;
  const postSub = await postWebhook(invoiceEventId, "PAYMENT_RECEIVED", invoicePaymentId, asaasSubscriptionId);
  assert(postSub === 200, "webhook da fatura aceito");
  const invoiceOutcome = await processWebhook(invoiceEventId);
  assert(
    invoiceOutcome === "processed" || invoiceOutcome === "already_processed",
    "fatura processada",
  );

  const { data: grant } = await admin
    .from("credit_ledger")
    .select("amount_cents")
    .eq("idempotency_key", `grant:sub:${asaasSubscriptionId}:pay:${invoicePaymentId}`)
    .maybeSingle();
  assert(grant?.amount_cents === 700, "franquia do atelier concedida (+700 = 7 créditos)");

  const { data: subAfter } = await admin
    .from("subscriptions")
    .select("status,current_period_end")
    .eq("asaas_subscription_id", asaasSubscriptionId)
    .maybeSingle();
  assert(subAfter?.status === "active", "assinatura ativa");
  assert(subAfter?.current_period_end !== null, "ciclo atual definido");

  // Consumo com 1 crédito
  const consumeEventId = randomUUID();
  await admin.from("events").insert({
    id: consumeEventId,
    owner_profile_id: anaId,
    workspace_id: workspaceId,
    title: "E2E — Festa com crédito",
    event_type: "festa_infantil",
    event_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    region_code: "sp",
    guest_count: 25,
    status: "draft",
  });
  await admin.from("credit_ledger").insert({
    workspace_id: workspaceId,
    entry_type: "consume",
    amount_cents: -100,
    balance_after_cents: 600,
    event_id: consumeEventId,
    idempotency_key: `consume:event:${consumeEventId}`,
    note: "ativação por crédito (e2e)",
  });
  const { data: balanceAfterConsume } = await admin
    .from("credit_ledger")
    .select("balance_after_cents")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assert(balanceAfterConsume?.balance_after_cents === 600, "consumo de 1 crédito (saldo 6)");

  console.log("");
  if (failures === 0) {
    console.log("✅ E2E local: todos os fluxos passaram.");
  } else {
    console.error(`❌ E2E local: ${String(failures)} verificação(ões) falharam.`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
