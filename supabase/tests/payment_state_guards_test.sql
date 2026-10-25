-- pgTAP: regressão — o cliente não ativa evento/tíquete nem grava pagamento pago (0029).
begin;
create extension if not exists pgtap;
select plan(12);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('29111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'guard-alice@teste.com', 'x', now(),
   '{}'::jsonb, '{"full_name":"Alice Guard"}'::jsonb, now(), now());

insert into public.events (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, status)
values ('29aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '29111111-1111-1111-1111-111111111111',
        'Evento guard', 'casamento', '2026-12-01', 'sp', 100, 'draft');

select set_config('request.jwt.claims',
  json_build_object('sub', '29111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Fluxo legítimo do checkout continua funcionando.
select lives_ok($$ insert into public.payments (id, profile_id, purpose, event_id, asaas_payment_id, billing_type, amount_cents, status)
  values ('29bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '29111111-1111-1111-1111-111111111111', 'event_ticket',
          '29aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pay_guard_ok', 'PIX', 9700, 'pending') $$,
  'cliente registra cobrança pendente');
select lives_ok($$ insert into public.event_tickets (event_id, status, payment_id)
  values ('29aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pending', '29bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  'cliente registra tíquete pendente');
select lives_ok($$ update public.events set status = 'awaiting_payment' where id = '29aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'cliente move draft -> awaiting_payment');
select lives_ok($$ update public.events set title = 'Novo título', city = 'São Paulo', interview_completed_at = now() where id = '29aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'cliente edita campos próprios (entrevista)');

-- Ataques (regressão do bug).
select throws_ok($$ update public.events set status = 'active' where id = '29aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null, 'cliente NÃO ativa o evento direto');
select throws_ok($$ insert into public.events (owner_profile_id, title, event_type, event_date, region_code, guest_count, status)
  values ('29111111-1111-1111-1111-111111111111', 'x', 'casamento', '2026-12-01', 'sp', 10, 'active') $$,
  '42501', null, 'cliente NÃO cria evento já ativo');
select throws_ok($$ update public.events set quotes_delivered_at = now() where id = '29aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null, 'cliente NÃO altera campos do pipeline');
select throws_ok($$ update public.event_tickets set status = 'active' where event_id = '29aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null, 'cliente NÃO ativa o tíquete');
select throws_ok($$ insert into public.payments (profile_id, purpose, asaas_payment_id, billing_type, amount_cents, status)
  values ('29111111-1111-1111-1111-111111111111', 'credit_topup', 'pay_guard_paid', 'PIX', 1, 'paid') $$,
  '42501', null, 'cliente NÃO grava pagamento pago');

reset role;
select is((select status from public.events where id = '29aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'awaiting_payment',
  'evento segue aguardando pagamento');

-- Caminho do servidor (webhook definer) segue ativando.
insert into public.webhook_events (id, source, external_event_id, payload, status)
values ('29cccccc-cccc-cccc-cccc-cccccccccccc', 'asaas', 'evt_guard_1',
        '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_guard_ok","status":"RECEIVED"}}'::jsonb, 'received');
select is(public.process_payment_webhook('29cccccc-cccc-cccc-cccc-cccccccccccc'), 'processed', 'webhook processa');
select is((select status from public.events where id = '29aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'active',
  'webhook ativa evento normalmente');

select * from finish();
rollback;
