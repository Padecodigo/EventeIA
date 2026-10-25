-- pgTAP: estorno/chargeback revoga tíquete/evento/créditos (0031) e o
-- bootstrap de assinatura não reaproveita FOUND. Transação com rollback.
begin;
create extension if not exists pgtap;
select plan(16);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('31111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'reversal@teste.com', 'x', now(),
   '{}'::jsonb, '{"full_name":"Rita Reversal"}'::jsonb, now(), now());

insert into public.plans (code, name, price_cents, monthly_credits)
values ('pgtap31', 'Plano pgTAP', 1000, 5) on conflict (code) do nothing;
insert into public.workspaces (id, owner_id, name, plan_code)
values ('31eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '31111111-1111-1111-1111-111111111111', 'WS reversal', 'pgtap31');

-- ===== Tíquete B2C: pago -> estornado =====
insert into public.events (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, status)
values ('31aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '31111111-1111-1111-1111-111111111111',
        'Evento estorno', 'casamento', '2026-12-01', 'sp', 80, 'awaiting_payment');
insert into public.payments (id, profile_id, purpose, event_id, asaas_payment_id, billing_type, amount_cents)
values ('31bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '31111111-1111-1111-1111-111111111111', 'event_ticket',
        '31aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pay_rev_ticket', 'PIX', 9700);
insert into public.event_tickets (event_id, status, payment_id)
values ('31aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pending', '31bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into public.webhook_events (id, source, external_event_id, payload) values
  ('31c00001-0000-0000-0000-000000000000', 'asaas', 'evt_rev_1',
   '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_rev_ticket"}}'),
  ('31c00002-0000-0000-0000-000000000000', 'asaas', 'evt_rev_2',
   '{"event":"PAYMENT_REFUNDED","payment":{"id":"pay_rev_ticket"}}');

select is(public.process_payment_webhook('31c00001-0000-0000-0000-000000000000'), 'processed', 'pagamento confirmado');
select is((select status from public.events where id = '31aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'active', 'evento ativo após pagar');
select is(public.process_payment_webhook('31c00002-0000-0000-0000-000000000000'), 'processed', 'estorno processado');
select is((select status from public.event_tickets where payment_id = '31bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 'refunded',
  'regressão: tíquete estornado deixa de estar ativo');
select is((select status from public.events where id = '31aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'canceled',
  'regressão: evento estornado é cancelado (não apagado)');
select is((select count(*)::int from public.system_events
            where type = 'payment.reversal_applied' and aggregate_id = '31bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1,
  'auditoria registrada');

-- ===== Top-up: pago, parte consumida, chargeback =====
insert into public.payments (id, profile_id, purpose, asaas_payment_id, billing_type, amount_cents, credits_granted, workspace_id, status)
values ('31dddddd-dddd-dddd-dddd-dddddddddddd', '31111111-1111-1111-1111-111111111111', 'credit_topup',
        'pay_rev_topup', 'CREDIT_CARD', 1000, 10, '31eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'pending');
insert into public.webhook_events (id, source, external_event_id, payload) values
  ('31c00003-0000-0000-0000-000000000000', 'asaas', 'evt_rev_3',
   '{"event":"PAYMENT_CONFIRMED","payment":{"id":"pay_rev_topup"}}'),
  ('31c00004-0000-0000-0000-000000000000', 'asaas', 'evt_rev_4',
   '{"event":"PAYMENT_CHARGEBACK_REQUESTED","payment":{"id":"pay_rev_topup"}}');

select is(public.process_payment_webhook('31c00003-0000-0000-0000-000000000000'), 'processed', 'top-up pago');
select is((select coalesce(sum(amount_cents),0)::int from public.credit_ledger where workspace_id = '31eeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  1000, 'créditos concedidos');
insert into public.credit_ledger (workspace_id, entry_type, amount_cents, balance_after_cents, idempotency_key, note)
values ('31eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'consume', -300, 0, 'pgtap31:consume', 'consumo');

select is(public.process_payment_webhook('31c00004-0000-0000-0000-000000000000'), 'processed', 'chargeback processado');
select is((select amount_cents::int from public.credit_ledger where source_payment_id = '31dddddd-dddd-dddd-dddd-dddddddddddd' and entry_type = 'refund'),
  -700, 'regressão: estorna o saldo restante do pacote (limitado ao saldo)');
select is((select coalesce(sum(amount_cents),0)::int from public.credit_ledger where workspace_id = '31eeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  0, 'saldo zerado, nunca negativo');
select is((select (payload ->> 'shortfall_cents')::int from public.system_events
            where type = 'credits.revoked' and payload ->> 'payment_id' = '31dddddd-dddd-dddd-dddd-dddddddddddd'),
  300, 'consumo já feito fica registrado como shortfall');
select is((select count(*)::int from public.credit_ledger where entry_type <> 'refund'
            and workspace_id = '31eeeeee-eeee-eeee-eeee-eeeeeeeeeeee'), 2, 'nenhum lançamento apagado');

-- Reaplicar o status (ex.: reconciliação) não duplica.
update public.payments set status = 'chargeback' where id = '31dddddd-dddd-dddd-dddd-dddddddddddd';
select is((select count(*)::int from public.credit_ledger where entry_type = 'refund'
            and source_payment_id = '31dddddd-dddd-dddd-dddd-dddddddddddd'), 1, 'idempotente');

-- ===== Edge case: assinatura cujo workspace não resolve (plano resolve) =====
set local session_replication_role = replica;  -- simula FK quebrada (dado legado)
insert into public.subscriptions (workspace_id, plan_code, asaas_subscription_id)
values ('31ffffff-ffff-ffff-ffff-ffffffffffff', 'pgtap31', 'sub_rev_ghost');
set local session_replication_role = origin;
insert into public.webhook_events (id, source, external_event_id, payload) values
  ('31c00005-0000-0000-0000-000000000000', 'asaas', 'evt_rev_5',
   '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_rev_ghost","subscription":"sub_rev_ghost"}}');
select is(public.process_payment_webhook('31c00005-0000-0000-0000-000000000000'), 'payment_not_found',
  'regressão: sem pagamento após bootstrap ⇒ payment_not_found (antes: FOUND do último SELECT)');
select is((select status from public.webhook_events where id = '31c00005-0000-0000-0000-000000000000'), 'processed',
  'webhook não fica preso');

select * from finish();
rollback;
