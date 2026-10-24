/**
 * Simula um webhook do Asaas para testar o fluxo localmente.
 * ⚠️ Apenas desenvolvimento: recusa execução com NODE_ENV=production.
 *
 * Uso: pnpm simulate:webhook <asaas_payment_id> [evento] [asaas_subscription_id]
 *   evento padrão: PAYMENT_RECEIVED
 *   subscription_id (opcional): fatura de assinatura → concede franquia
 */
const paymentId = process.argv[2];
const eventName = process.argv[3] ?? "PAYMENT_RECEIVED";
const subscriptionId = process.argv[4] ?? "";

export {};

if (process.env.NODE_ENV === "production") {
  console.error("Recusado: simulação de webhook não roda em produção.");
  process.exit(1);
}

if (paymentId === undefined) {
  console.error("Uso: pnpm simulate:webhook <asaas_payment_id> [evento] [asaas_subscription_id]");
  process.exit(1);
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const token = process.env.ASAAS_WEBHOOK_TOKEN;

if (token === undefined || token.length === 0) {
  console.error("ASAAS_WEBHOOK_TOKEN ausente no .env.local.");
  process.exit(1);
}

const payload = {
  id: `evt_sim_${String(Date.now())}`,
  event: eventName,
  payment: {
    id: paymentId,
    status: eventName === "PAYMENT_RECEIVED" ? "RECEIVED" : eventName,
    ...(subscriptionId.length > 0 ? { subscription: subscriptionId } : {}),
  },
};

const response = await fetch(`${appUrl}/api/webhooks/asaas`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "asaas-access-token": token,
  },
  body: JSON.stringify(payload),
});

console.log(`HTTP ${String(response.status)}`);
console.log(await response.text());
