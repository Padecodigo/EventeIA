-- pgTAP: top-up sob medida (slider) — webhook pago concede exatamente N créditos (0008), idempotente.
begin;
create extension if not exists pgtap;
select plan(4);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('51111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'slider@teste.com', 'x', now(),
   '{}'::jsonb, '{"full_name":"Slider"}'::jsonb, now(), now());

insert into public.workspaces (id, owner_id, name, plan_code)
values ('51aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '51111111-1111-1111-1111-111111111111', 'WS slider', 'essencial');

insert into public.payments (id, profile_id, purpose, workspace_id, credits_granted, asaas_payment_id, billing_type, amount_cents, status)
values ('51bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '51111111-1111-1111-1111-111111111111', 'credit_topup',
        '51aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 12, 'pay_slider_12', 'PIX', 29700, 'pending');

insert into public.webhook_events (id, source, external_event_id, payload, status)
values ('51cccccc-cccc-cccc-cccc-cccccccccccc', 'asaas', 'evt_slider_1',
        '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_slider_12","status":"RECEIVED"}}'::jsonb, 'received'),
       ('51dddddd-dddd-dddd-dddd-dddddddddddd', 'asaas', 'evt_slider_2',
        '{"event":"PAYMENT_CONFIRMED","payment":{"id":"pay_slider_12","status":"CONFIRMED"}}'::jsonb, 'received');

select is(public.process_payment_webhook('51cccccc-cccc-cccc-cccc-cccccccccccc'), 'processed', 'webhook processa');
select is((select status from public.payments where id = '51bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 'paid', 'pagamento pago');
select is(public.process_payment_webhook('51dddddd-dddd-dddd-dddd-dddddddddddd'), 'already_paid', 'reentrega não reprocessa');
select is((select sum(amount_cents)::int from public.credit_ledger
            where workspace_id = '51aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and entry_type = 'topup'),
          1200, 'concede exatamente 12 créditos');

select * from finish();
rollback;
