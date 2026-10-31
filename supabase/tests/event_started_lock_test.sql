-- pgTAP: trava de edição até o início agendado da busca (0073 + 0074).
-- Regressão: entrevista de evento com busca em andamento editada pelo dono (31/10/2026).
begin;

create extension if not exists pgtap;

select plan(19);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1c30000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-lk@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Dono LK"}'::jsonb, now(), now());

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values
  ('a1c32222-0000-4000-8000-000000000001', 'a1c30000-0000-4000-8000-000000000002',
   'Busca rodando', 'aniversario', '2027-12-10', 'sp', 50),
  ('a1c32222-0000-4000-8000-000000000002', 'a1c30000-0000-4000-8000-000000000002',
   'Ativo, busca não começou', 'aniversario', '2027-12-11', 'sp', 50),
  ('a1c32222-0000-4000-8000-000000000003', 'a1c30000-0000-4000-8000-000000000002',
   'Encerrado', 'aniversario', '2027-12-12', 'sp', 50);
-- (como postgres: guardas do cliente não se aplicam ao setup)
update public.events
   set status = 'active', interview_completed_at = now(), discovery_started_at = now(),
       discovery_status = 'running', interview_answers = '{"a":1}'::jsonb
 where id = 'a1c32222-0000-4000-8000-000000000001';
update public.events set status = 'active', interview_completed_at = now()
 where id = 'a1c32222-0000-4000-8000-000000000002';
update public.events set status = 'completed' where id = 'a1c32222-0000-4000-8000-000000000003';
insert into public.event_requirements (event_id, catalog_version, category, item_code, label, unit, quantity, mandatory)
values ('a1c32222-0000-4000-8000-000000000001', 'v1', 'buffet', 'buffet_x', 'Buffet', 'por_pessoa', 50, true),
       ('a1c32222-0000-4000-8000-000000000002', 'v1', 'buffet', 'buffet_x', 'Buffet', 'por_pessoa', 50, true);

-- limites do instante agendado (18/11/2026 → 09:00 BRT = 12:00Z)
select is(public.event_search_start_at('2026-11-18'), '2026-11-18 12:00:00+00'::timestamptz, 'início agendado = 09:00 de Brasília');
select ok(not public.event_edit_locked('active', null, '2026-11-18', '2026-11-18 11:59:59+00'),
  'editável 1s antes do início agendado');
select ok(public.event_edit_locked('active', null, '2026-11-18', '2026-11-18 12:00:00+00'),
  'travado exatamente no início agendado');
select ok(public.event_edit_locked('active', '2026-11-01 12:00+00', '2026-11-18', '2026-11-02 00:00+00'),
  'travado antes do agendado se a busca já começou');
select ok(not public.event_edit_locked('active', null, null), 'ativo sem data e sem busca segue editável');
select ok(public.event_edit_locked('completed', null, null), 'encerrado travado');
select hasnt_function('public', 'event_is_started', array['text','timestamp with time zone','timestamp with time zone'], 'função antiga removida');

-- dono
select set_config('request.jwt.claims',
  json_build_object('sub', 'a1c30000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ update public.events set interview_answers = '{"a":2}'::jsonb
  where id = 'a1c32222-0000-4000-8000-000000000001' $$, '42501', null,
  'REGRESSÃO: dono não edita a entrevista com a busca em andamento');
select throws_ok($$ update public.events set guest_count = 80 where id = 'a1c32222-0000-4000-8000-000000000001' $$,
  '42501', null, 'dono não altera convidados');
select throws_ok($$ update public.events set search_start_date = null where id = 'a1c32222-0000-4000-8000-000000000001' $$,
  '42501', null, 'dono não altera a data de início depois que a busca começou');
select throws_ok($$ update public.event_requirements set quantity = 99 where event_id = 'a1c32222-0000-4000-8000-000000000001' $$,
  '42501', null, 'dono não altera requisitos da entrevista');
select lives_ok($$ select public.set_event_budget_limit('a1c32222-0000-4000-8000-000000000001', 3000000) $$,
  'orçamento limite editável com a busca rodando');
select lives_ok($$ select public.set_event_budget_limit('a1c32222-0000-4000-8000-000000000003', 3000000) $$,
  'orçamento limite editável com o evento encerrado');
select lives_ok($$ update public.events set guest_count = 70 where id = 'a1c32222-0000-4000-8000-000000000002' $$,
  'entrevista concluída mas busca não começou: dados editáveis');
select lives_ok($$ update public.event_requirements set quantity = 60 where event_id = 'a1c32222-0000-4000-8000-000000000002' $$,
  'entrevista concluída mas busca não começou: requisitos editáveis');
select throws_ok($$ update public.events set guest_count = 70 where id = 'a1c32222-0000-4000-8000-000000000003' $$,
  '42501', null, 'encerrado: dados travados');
select lives_ok($$ update public.events set status = 'completed' where id = 'a1c32222-0000-4000-8000-000000000001' $$,
  'encerrar evento continua permitido');
reset role;

-- servidor/jobs isentos
set local role service_role;
select lives_ok($$ update public.events set discovery_status = 'completed', collection_ended_at = now()
  where id = 'a1c32222-0000-4000-8000-000000000002' $$, 'job do servidor atualiza a busca');
reset role;
select is((select interview_answers from public.events where id = 'a1c32222-0000-4000-8000-000000000001'),
  '{"a":1}'::jsonb, 'entrevista permaneceu intacta');

select * from finish();
rollback;
