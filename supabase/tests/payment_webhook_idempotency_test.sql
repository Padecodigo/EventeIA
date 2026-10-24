-- pgTAP: process_payment_webhook é idempotente (replay não duplica tíquete).
-- Tudo dentro de transação com rollback — não altera dados locais.
begin;
create extension if not exists pgtap;
select plan(5);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carol@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(),
   '{}'::jsonb, '{"full_name":"Carol"}'::jsonb, now(), now());

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333',
   'Festa infantil', 'aniversario', '2026-12-10', 'sp', 30);

insert into public.payments (profile_id, purpose, event_id, asaas_payment_id, billing_type, amount_cents)
values ('33333333-3333-3333-3333-333333333333', 'event_ticket',
        'cccccccc-cccc-cccc-cccc-cccccccccccc', 'pay_pgtap_1', 'PIX', 4990);

-- Checkout cria o tíquete pendente; o webhook o ativa.
insert into public.event_tickets (event_id, status, payment_id)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'pending',
        (select id from public.payments where asaas_payment_id = 'pay_pgtap_1'));

insert into public.webhook_events (id, source, external_event_id, payload)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'asaas', 'evt_pgtap_1',
        '{"id":"evt_pgtap_1","event":"PAYMENT_RECEIVED","payment":{"id":"pay_pgtap_1","status":"RECEIVED"}}');

select isnt(public.process_payment_webhook('dddddddd-dddd-dddd-dddd-dddddddddddd'), 'already_processed',
  '1ª execução processa');
select is(public.process_payment_webhook('dddddddd-dddd-dddd-dddd-dddddddddddd'), 'already_processed',
  'replay do mesmo evento não reprocessa');
select is((select status from public.payments where asaas_payment_id = 'pay_pgtap_1'), 'paid',
  'pagamento marcado como pago');
select is((select count(*)::int from public.event_tickets where event_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 1,
  'exatamente 1 tíquete');
select is((select status from public.event_tickets where event_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 'active',
  'tíquete ativo');

select * from finish();
rollback;
