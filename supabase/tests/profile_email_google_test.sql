-- pgTAP: login com Google — perfil criado com nome/e-mail e e-mail protegido.
begin;

create extension if not exists pgtap;

select plan(7);

insert into auth.users
  (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carla@gmail.com',
   '{"provider":"google","providers":["google"]}'::jsonb,
   '{"name":"Carla Google","email":"carla@gmail.com"}'::jsonb, now(), now());

select is(
  (select display_name from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'Carla Google', 'nome vem do metadado "name" do Google');

select is(
  (select email from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'carla@gmail.com', 'e-mail do Google gravado no perfil');

update auth.users set email = 'carla.nova@gmail.com'
where id = '33333333-3333-3333-3333-333333333333';

select is(
  (select email from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'carla.nova@gmail.com', 'troca de e-mail no auth sincroniza o perfil');

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE'),
  'authenticated não pode alterar o e-mail do perfil');

select ok(
  not has_function_privilege('authenticated', 'public.sync_profile_email()', 'EXECUTE'),
  'sync_profile_email não é executável por authenticated');

-- Como o próprio usuário: lê o e-mail, mas não consegue sobrescrevê-lo.
select set_config('request.jwt.claims',
  json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is(
  (select email from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'carla.nova@gmail.com', 'dono lê o próprio e-mail');

select throws_ok(
  $$ update public.profiles set email = 'atacante@x.com'
     where id = '33333333-3333-3333-3333-333333333333' $$,
  '42501', null, 'UPDATE de e-mail pelo cliente é negado');

select * from finish();
rollback;
