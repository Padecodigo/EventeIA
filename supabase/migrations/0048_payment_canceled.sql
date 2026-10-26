-- 0048 — Cobrança cancelada localmente (Pix de evento excluído antes do pagamento).
-- A cobrança é removida no Asaas (DELETE /payments/{id}); o status local vira
-- 'canceled' (terminal). Webhook tardio (ex.: PAYMENT_RECEIVED) cai na guarda
-- de transições da função process_payment_webhook e é rejeitado — sem efeito.

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (
    status in (
      'pending',
      'paid',
      'confirmed',
      'overdue',
      'refunded',
      'risk_review',
      'chargeback',
      'canceled'
    )
  );
