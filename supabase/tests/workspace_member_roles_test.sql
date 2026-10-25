-- pgTAP: planner não concede papel acima do próprio nem remove o owner (0032).
begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('32000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ws-owner@teste.com', 'x', now(), '{}'::jsonb, '{"full_name":"Olga Owner"}'::jsonb, now(), now()),
  ('32000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ws-planner@teste.com', 'x', now(), '{}'::jsonb, '{"full_name":"Paulo Planner"}'::jsonb, now(), now()),
  ('32000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ws-new@teste.com', 'x', now(), '{}'::jsonb, '{"full_name":"Nina Nova"}'::jsonb, now(), now()),
  ('32000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ws-viewer@teste.com', 'x', now(), '{}'::jsonb, '{"full_name":"Vera Viewer"}'::jsonb, now(), now());

insert into public.workspaces (id, owner_id, name)
values ('32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '32000000-0000-0000-0000-00000000000a', 'WS roles');
insert into public.workspace_members (workspace_id, profile_id, member_role) values
  ('32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '32000000-0000-0000-0000-00000000000a', 'owner'),
  ('32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '32000000-0000-0000-0000-00000000000b', 'planner'),
  ('32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '32000000-0000-0000-0000-00000000000d', 'viewer');

-- Como planner
select set_config('request.jwt.claims', '{"sub":"32000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;

select throws_ok($$ insert into public.workspace_members (workspace_id, profile_id, member_role)
  values ('32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '32000000-0000-0000-0000-00000000000c', 'owner') $$,
  '42501', null, 'regressão: planner NÃO concede owner');
select lives_ok($$ insert into public.workspace_members (workspace_id, profile_id, member_role)
  values ('32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '32000000-0000-0000-0000-00000000000c', 'viewer') $$,
  'planner adiciona viewer');
delete from public.workspace_members
 where workspace_id = '32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and profile_id = '32000000-0000-0000-0000-00000000000a';
select is((select public.workspace_role('32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee')), 'planner', 'workspace_role devolve o próprio papel');
select lives_ok($$ delete from public.workspace_members
  where workspace_id = '32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and profile_id = '32000000-0000-0000-0000-00000000000c' $$,
  'planner remove viewer');

-- Como viewer
select set_config('request.jwt.claims', '{"sub":"32000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select throws_ok($$ insert into public.workspace_members (workspace_id, profile_id, member_role)
  values ('32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '32000000-0000-0000-0000-00000000000c', 'viewer') $$,
  '42501', null, 'viewer não adiciona ninguém');

-- Como owner
select set_config('request.jwt.claims', '{"sub":"32000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ insert into public.workspace_members (workspace_id, profile_id, member_role)
  values ('32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '32000000-0000-0000-0000-00000000000c', 'owner') $$,
  '42501', null, 'owner não é concedido pelo cliente (posse é do servidor)');

reset role;
select is((select count(*)::int from public.workspace_members
            where workspace_id = '32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and member_role = 'owner'), 1,
  'regressão: planner NÃO removeu o owner');
select is((select count(*)::int from public.workspace_members
            where workspace_id = '32eeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and profile_id = '32000000-0000-0000-0000-00000000000c'), 0,
  'viewer removido');

select * from finish();
rollback;
