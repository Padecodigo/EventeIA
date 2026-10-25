-- pgTAP: RLS de terms_acceptances (0041).
begin;

create extension if not exists pgtap;

select plan(7);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('41111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'tina@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Tina"}'::jsonb, now(), now()),
  ('42222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ugo@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Ugo"}'::jsonb, now(), now());

-- service_role (servidor) grava o aceite
insert into public.terms_acceptances (profile_id, terms_version, context)
values ('41111111-1111-1111-1111-111111111111', '2026-10-25', 'signup');

select is(
  (select relrowsecurity from pg_class where oid = 'public.terms_acceptances'::regclass),
  true, 'RLS habilitada');

select throws_ok($$
  insert into public.terms_acceptances (profile_id, terms_version, context)
  values ('41111111-1111-1111-1111-111111111111', '2026-10-25', 'outro')
$$, '23514', null, 'Contexto inválido é rejeitado');

select set_config('request.jwt.claims',
  json_build_object('sub', '41111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*) from public.terms_acceptances), 1::bigint, 'Titular vê o próprio aceite');

select throws_ok($$
  insert into public.terms_acceptances (profile_id, terms_version, context)
  values ('41111111-1111-1111-1111-111111111111', '2026-10-25', 'checkout')
$$, '42501', null, 'Usuário não grava aceite direto (só o servidor)');

select throws_ok($$
  delete from public.terms_acceptances
$$, '42501', null, 'Usuário não apaga aceite');

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', '42222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*) from public.terms_acceptances), 0::bigint, 'Outro usuário não vê aceites alheios');

reset role;
set local role anon;

select throws_ok($$ select count(*) from public.terms_acceptances $$, '42501', null, 'anon sem acesso');

select * from finish();
rollback;
