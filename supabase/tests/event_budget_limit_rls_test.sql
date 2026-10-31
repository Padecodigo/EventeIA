-- pgTAP: orçamento limite do evento (0072) — coluna, guarda dono/admin, histórico e RLS.
begin;

create extension if not exists pgtap;

select plan(20);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1b20000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin-bl@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Admin BL"}'::jsonb, now(), now()),
  ('a1b20000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-bl@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Dono BL"}'::jsonb, now(), now()),
  ('a1b20000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'planner-bl@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Planner BL"}'::jsonb, now(), now()),
  ('a1b20000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outro-bl@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Outro BL"}'::jsonb, now(), now());

update public.profiles set role = 'admin' where id = 'a1b20000-0000-4000-8000-000000000001';

insert into public.workspaces (id, owner_id, name)
values ('a1b21111-0000-4000-8000-000000000001', 'a1b20000-0000-4000-8000-000000000002', 'WS BL')
on conflict do nothing;
insert into public.workspace_members (workspace_id, profile_id, member_role)
values ('a1b21111-0000-4000-8000-000000000001', 'a1b20000-0000-4000-8000-000000000003', 'planner')
on conflict do nothing;

insert into public.events
  (id, owner_profile_id, workspace_id, title, event_type, event_date, region_code, guest_count)
values
  ('a1b22222-0000-4000-8000-000000000001', 'a1b20000-0000-4000-8000-000000000002',
   'a1b21111-0000-4000-8000-000000000001', 'Festa BL', 'aniversario', '2026-12-10', 'sp', 50),
  ('a1b22222-0000-4000-8000-000000000002', 'a1b20000-0000-4000-8000-000000000002',
   null, 'Festa encerrada', 'aniversario', '2026-12-11', 'sp', 50);
update public.events set status = 'completed' where id = 'a1b22222-0000-4000-8000-000000000002';

-- estrutura
select has_column('public', 'events', 'budget_limit_cents', 'events.budget_limit_cents existe');
select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.event_budget_limit_history'::regclass),
  true, 'RLS habilitada e forçada no histórico');
select throws_ok($$ update public.events set budget_limit_cents = 50 where id = 'a1b22222-0000-4000-8000-000000000001' $$,
  '23514', null, 'check rejeita limite abaixo de R$ 100');

-- anon
set local role anon;
select throws_ok($$ select count(*) from public.event_budget_limit_history $$, '42501', null, 'anon não lê histórico');
reset role;

-- dono
select set_config('request.jwt.claims',
  json_build_object('sub', 'a1b20000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$ update public.events set budget_limit_cents = 3000000 where id = 'a1b22222-0000-4000-8000-000000000001' $$,
  'dono edita o limite via UPDATE');
select lives_ok($$ select public.set_event_budget_limit('a1b22222-0000-4000-8000-000000000001', 4000000) $$,
  'dono edita o limite via RPC');
select is((select count(*) from public.event_budget_limit_history where event_id = 'a1b22222-0000-4000-8000-000000000001'),
  2::bigint, 'dono vê 2 linhas de histórico');
select results_eq(
  $$ select old_cents, new_cents, source from public.event_budget_limit_history
     where event_id = 'a1b22222-0000-4000-8000-000000000001' order by changed_at, new_cents $$,
  $$ values (null::bigint, 3000000::bigint, 'owner'::text), (3000000::bigint, 4000000::bigint, 'owner'::text) $$,
  'histórico registra valor anterior, novo e origem');
select throws_ok($$ insert into public.event_budget_limit_history (event_id, new_cents, source)
  values ('a1b22222-0000-4000-8000-000000000001', 1, 'owner') $$, '42501', null, 'dono não insere histórico direto');
select throws_ok($$ delete from public.event_budget_limit_history $$, '42501', null, 'dono não apaga histórico');
select lives_ok($$ select public.set_event_budget_limit('a1b22222-0000-4000-8000-000000000002', 5000000) $$,
  'evento encerrado ainda aceita novo limite (0074)');
select throws_ok($$ select public.set_event_budget_limit('a1b22222-0000-4000-8000-000000000001', 10) $$,
  '22023', null, 'RPC valida faixa');
reset role;

-- planner do workspace (pode editar outros dados do evento, não o limite)
select set_config('request.jwt.claims',
  json_build_object('sub', 'a1b20000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$ update public.events set guest_count = 60 where id = 'a1b22222-0000-4000-8000-000000000001' $$,
  'planner segue editando convidados (regressão)');
select throws_ok($$ update public.events set budget_limit_cents = 9000000 where id = 'a1b22222-0000-4000-8000-000000000001' $$,
  '42501', null, 'planner não altera o limite');
select is((select count(*) from public.event_budget_limit_history), 0::bigint, 'planner não lê o histórico');
reset role;

-- outro usuário
select set_config('request.jwt.claims',
  json_build_object('sub', 'a1b20000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ select public.set_event_budget_limit('a1b22222-0000-4000-8000-000000000001', 5000000) $$,
  '42501', null, 'estranho não altera via RPC');
select is((select count(*) from public.event_budget_limit_history), 0::bigint, 'estranho não lê o histórico');
reset role;

-- admin
select set_config('request.jwt.claims',
  json_build_object('sub', 'a1b20000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$ select public.set_event_budget_limit('a1b22222-0000-4000-8000-000000000001', 5000000) $$,
  'admin altera via RPC');
select is((select source from public.event_budget_limit_history
  where event_id = 'a1b22222-0000-4000-8000-000000000001' and new_cents = 5000000), 'admin', 'origem admin auditada');
reset role;

select is((select budget_limit_cents from public.events where id = 'a1b22222-0000-4000-8000-000000000001'),
  5000000::bigint, 'valor final persistido');

select * from finish();
rollback;
