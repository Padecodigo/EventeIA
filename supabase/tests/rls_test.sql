-- pgTAP: RLS default-deny (executar com `supabase test db`)
-- Usuários e eventos de teste; RLS aplicada aos papéis reais.

begin;

create extension if not exists pgtap;

select plan(6);

-- ============================================================
-- Fixtures (role postgres/superuser — ignora RLS)
-- ============================================================
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(),
   '{}'::jsonb, '{"full_name":"Alice Anfitriã"}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(),
   '{}'::jsonb, '{"full_name":"Bob Planner"}'::jsonb, now(), now());

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Evento da Alice', 'casamento', '2026-12-01', 'sp', 100),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'Evento do Bob', 'corporativo', '2026-12-02', 'rj', 80);

-- ============================================================
-- Alice
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.events), 1::bigint,
  'Alice enxerga somente o próprio evento');

select results_eq(
  $$ select title from public.events $$,
  array['Evento da Alice'],
  'O evento visível é o da Alice');

select is((select count(*) from public.profiles), 1::bigint,
  'Alice enxerga somente o próprio perfil');

reset role;

-- ============================================================
-- Bob
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.events), 1::bigint,
  'Bob enxerga somente o próprio evento');

select is((select count(*) from public.profiles), 1::bigint,
  'Bob enxerga somente o próprio perfil');

reset role;

-- ============================================================
-- anon
-- ============================================================
set local role anon;

select is((select count(*) from public.events), 0::bigint,
  'anon não enxerga eventos');

select * from finish();

rollback;
