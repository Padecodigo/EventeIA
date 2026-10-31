-- pgTAP: evento iniciado travado para o cliente (0073). Regressão: entrevista
-- de evento ativo editada pelo dono (31/10/2026).
begin;

create extension if not exists pgtap;

select plan(16);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1c30000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin-lk@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Admin LK"}'::jsonb, now(), now()),
  ('a1c30000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-lk@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Dono LK"}'::jsonb, now(), now());

update public.profiles set role = 'admin' where id = 'a1c30000-0000-4000-8000-000000000001';

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values
  ('a1c32222-0000-4000-8000-000000000001', 'a1c30000-0000-4000-8000-000000000002',
   'Ativo iniciado', 'aniversario', '2026-12-10', 'sp', 50),
  ('a1c32222-0000-4000-8000-000000000002', 'a1c30000-0000-4000-8000-000000000002',
   'Ativo sem entrevista', 'aniversario', '2026-12-11', 'sp', 50),
  ('a1c32222-0000-4000-8000-000000000003', 'a1c30000-0000-4000-8000-000000000002',
   'Rascunho', 'aniversario', '2026-12-12', 'sp', 50);
update public.events
   set status = 'active', interview_completed_at = now(), discovery_started_at = now(),
       discovery_status = 'running', interview_answers = '{"a":1}'::jsonb
 where id = 'a1c32222-0000-4000-8000-000000000001';
update public.events set status = 'active' where id = 'a1c32222-0000-4000-8000-000000000002';
insert into public.event_requirements (event_id, catalog_version, category, item_code, label, unit, quantity, mandatory)
values ('a1c32222-0000-4000-8000-000000000001', 'v1', 'buffet', 'buffet_x', 'Buffet', 'por_pessoa', 50, true);

select has_function('public', 'event_is_started', array['text','timestamp with time zone','timestamp with time zone']);
select ok(public.event_is_started('completed', null, null), 'completed conta como iniciado');
select ok(not public.event_is_started('active', null, null), 'ativo sem entrevista nem busca ainda não iniciou');

-- dono
select set_config('request.jwt.claims',
  json_build_object('sub', 'a1c30000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ update public.events set interview_answers = '{"a":2}'::jsonb
  where id = 'a1c32222-0000-4000-8000-000000000001' $$, '42501', null,
  'REGRESSÃO: dono não edita a entrevista de evento ativo');
select throws_ok($$ update public.events set guest_count = 80 where id = 'a1c32222-0000-4000-8000-000000000001' $$,
  '42501', null, 'dono não altera convidados');
select throws_ok($$ update public.events set event_date = '2026-12-20' where id = 'a1c32222-0000-4000-8000-000000000001' $$,
  '42501', null, 'dono não altera a data');
select throws_ok($$ update public.events set city = 'Outra' where id = 'a1c32222-0000-4000-8000-000000000001' $$,
  '42501', null, 'dono não altera a cidade');
select throws_ok($$ update public.event_requirements set quantity = 99 where event_id = 'a1c32222-0000-4000-8000-000000000001' $$,
  '42501', null, 'dono não altera requisitos da entrevista');
select throws_ok($$ insert into public.event_requirements (event_id, catalog_version, category, item_code, label, unit, quantity, mandatory)
  values ('a1c32222-0000-4000-8000-000000000001', 'v1', 'bebidas', 'agua', 'Água', 'unidade', 1, false) $$,
  '42501', null, 'dono não insere requisitos');
select lives_ok($$ select public.set_event_budget_limit('a1c32222-0000-4000-8000-000000000001', 3000000) $$,
  'orçamento limite continua editável');
select lives_ok($$ update public.events set guest_count = 70 where id = 'a1c32222-0000-4000-8000-000000000002' $$,
  'ativo antes da entrevista ainda aceita edição (fluxo de primeira entrevista)');
select lives_ok($$ update public.events set guest_count = 70 where id = 'a1c32222-0000-4000-8000-000000000003' $$,
  'rascunho aceita edição');
select lives_ok($$ update public.events set status = 'completed' where id = 'a1c32222-0000-4000-8000-000000000001' $$,
  'encerrar evento continua permitido');
reset role;

-- admin isento
select set_config('request.jwt.claims',
  json_build_object('sub', 'a1c30000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$ update public.events set guest_count = 90 where id = 'a1c32222-0000-4000-8000-000000000001' $$, 'trigger isenta admin (sem 42501)');
reset role;

-- servidor/jobs isentos (service_role grava status da busca)
set local role service_role;
select lives_ok($$ update public.events set discovery_status = 'completed', collection_ended_at = now()
  where id = 'a1c32222-0000-4000-8000-000000000001' $$, 'job do servidor atualiza a busca');
reset role;
select is((select interview_answers from public.events where id = 'a1c32222-0000-4000-8000-000000000001'),
  '{"a":1}'::jsonb, 'entrevista permaneceu intacta');

select * from finish();
rollback;
