-- pgTAP: exclusão do histórico de eventos (0075) — RLS, RPCs, carência e expurgo.
-- Regressão financeira: pagamento do evento expurgado continua íntegro.
begin;

create extension if not exists pgtap;

select plan(24);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1d40000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin-hd@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Admin HD"}'::jsonb, now(), now()),
  ('a1d40000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-hd@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Dono HD"}'::jsonb, now(), now()),
  ('a1d40000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outro-hd@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Outro HD"}'::jsonb, now(), now());
update public.profiles set role = 'admin' where id = 'a1d40000-0000-4000-8000-000000000001';

insert into public.events (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values
  ('a1d42222-0000-4000-8000-000000000001', 'a1d40000-0000-4000-8000-000000000002', 'Encerrado A', 'aniversario', '2027-09-10', 'sp', 50),
  ('a1d42222-0000-4000-8000-000000000002', 'a1d40000-0000-4000-8000-000000000002', 'Excluído B', 'aniversario', '2027-09-11', 'sp', 50),
  ('a1d42222-0000-4000-8000-000000000003', 'a1d40000-0000-4000-8000-000000000002', 'Ativo C', 'aniversario', '2026-12-11', 'sp', 50),
  ('a1d42222-0000-4000-8000-000000000004', 'a1d40000-0000-4000-8000-000000000003', 'Do outro', 'aniversario', '2027-09-12', 'sp', 50);
update public.events set status = 'completed', interview_answers = '{"x":1}'::jsonb
 where id in ('a1d42222-0000-4000-8000-000000000001', 'a1d42222-0000-4000-8000-000000000004');
update public.events set status = 'canceled' where id = 'a1d42222-0000-4000-8000-000000000002';
update public.events set status = 'active' where id = 'a1d42222-0000-4000-8000-000000000003';
insert into public.event_requirements (event_id, catalog_version, category, item_code, label, unit, quantity, mandatory)
values ('a1d42222-0000-4000-8000-000000000001', 'v1', 'buffet', 'buffet_x', 'Buffet', 'por_pessoa', 50, true);
insert into public.payments (profile_id, purpose, event_id, asaas_payment_id, billing_type, amount_cents, status)
values ('a1d40000-0000-4000-8000-000000000002', 'event_ticket', 'a1d42222-0000-4000-8000-000000000001',
        'pay_hd_1', 'PIX', 4990, 'confirmed');

-- estrutura
select has_column('public', 'events', 'user_deleted_at', 'coluna user_deleted_at');
select is((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.event_deletion_audit'::regclass),
  true, 'RLS habilitada e forçada na auditoria');

-- anon
set local role anon;
select throws_ok($$ select public.request_event_history_deletion(null) $$, '42501', null, 'anon não apaga');
reset role;

-- outro usuário
select set_config('request.jwt.claims', json_build_object('sub', 'a1d40000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ select public.request_event_history_deletion(array['a1d42222-0000-4000-8000-000000000001']::uuid[]) $$,
  '42501', null, 'não apaga evento de outro usuário');
reset role;

-- dono
select set_config('request.jwt.claims', json_build_object('sub', 'a1d40000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ select public.request_event_history_deletion(array['a1d42222-0000-4000-8000-000000000003']::uuid[]) $$,
  '42501', null, 'evento ativo nunca é apagado');
select is(public.request_event_history_deletion(array['a1d42222-0000-4000-8000-000000000001']::uuid[]), 1, 'apaga um encerrado');
select is((select count(*) from public.events where id = 'a1d42222-0000-4000-8000-000000000001'), 0::bigint,
  'evento apagado some para o dono');
select is((select count(*) from public.event_requirements where event_id = 'a1d42222-0000-4000-8000-000000000001'), 0::bigint,
  'filhos somem junto (RLS via evento)');
select is((select count(*) from public.list_my_deleted_events()), 1::bigint, 'aparece em apagados recentemente');
select lives_ok($$ select public.undo_event_history_deletion('a1d42222-0000-4000-8000-000000000001') $$, 'desfaz na carência');
select is((select count(*) from public.events where id = 'a1d42222-0000-4000-8000-000000000001'), 1::bigint, 'evento volta');
select is(public.request_event_history_deletion(null), 2, 'apagar tudo pega só encerrados/excluídos do dono');
select is((select status from public.events where id = 'a1d42222-0000-4000-8000-000000000003'), 'active', 'ativo intacto');
select throws_ok($$ insert into public.event_deletion_audit (event_id, profile_id, action)
  values ('a1d42222-0000-4000-8000-000000000001', 'a1d40000-0000-4000-8000-000000000002', 'undone') $$,
  '42501', null, 'usuário não escreve auditoria');
select throws_ok($$ select public.purge_user_deleted_events(now()) $$, '42501', null, 'usuário não roda o expurgo');
reset role;

-- admin vê a linha (rótulo na UI), mas não escreve
select set_config('request.jwt.claims', json_build_object('sub', 'a1d40000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.events where id = 'a1d42222-0000-4000-8000-000000000001'), 1::bigint, 'admin lê o evento apagado');
reset role;

-- expurgo (service_role) — antes da carência não faz nada
set local role service_role;
select is(public.purge_user_deleted_events(now()), 0, 'dentro dos 30 dias não expurga');
select is(public.purge_user_deleted_events(now() + interval '31 days'), 2, 'após 30 dias expurga');
select is(public.purge_user_deleted_events(now() + interval '32 days'), 0, 'idempotente');
reset role;
select is((select title from public.events where id = 'a1d42222-0000-4000-8000-000000000001'), 'Evento removido', 'evento anonimizado');
select is((select interview_answers from public.events where id = 'a1d42222-0000-4000-8000-000000000001'), null::jsonb, 'entrevista apagada');
select is((select count(*) from public.event_requirements where event_id = 'a1d42222-0000-4000-8000-000000000001'), 0::bigint, 'requisitos apagados');
-- regressão financeira
select results_eq($$ select amount_cents, status from public.payments where asaas_payment_id = 'pay_hd_1' $$,
  $$ values (4990::bigint, 'confirmed'::text) $$, 'pagamento do evento expurgado mantido');

select set_config('request.jwt.claims', json_build_object('sub', 'a1d40000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ select public.undo_event_history_deletion('a1d42222-0000-4000-8000-000000000001') $$,
  '42501', null, 'não desfaz depois do expurgo');
reset role;

select * from finish();
rollback;
