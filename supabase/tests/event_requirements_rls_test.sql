-- pgTAP: RLS de event_requirements e colunas da entrevista (0015).
begin;

create extension if not exists pgtap;

select plan(8);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('31111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carla@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Carla"}'::jsonb, now(), now()),
  ('32222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'davi@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Davi"}'::jsonb, now(), now());

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, city)
values
  ('3aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '31111111-1111-1111-1111-111111111111',
   'Festa da Carla', 'festa_infantil', '2026-12-10', 'sp', 40, 'Taubaté');

select has_column('public', 'events', 'interview_completed_at', 'events.interview_completed_at existe');

-- Carla (dona)
select set_config('request.jwt.claims',
  json_build_object('sub', '31111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok($$
  insert into public.event_requirements (event_id, catalog_version, category, item_code, label, unit, quantity, mandatory)
  values ('3aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'catalog-v1', 'limpeza', 'limpeza_pre_pos', 'Limpeza', 'pacote', 1, false)
$$, 'Dona cria requisito do próprio evento');

select is((select count(*) from public.event_requirements), 1::bigint, 'Dona enxerga o requisito');

select throws_ok($$
  insert into public.event_requirements (event_id, catalog_version, category, item_code, label, unit, quantity)
  values ('3aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'catalog-v1', 'limpeza', 'limpeza_pre_pos', 'Limpeza', 'pacote', 1)
$$, '23505', null, 'Item duplicado no mesmo evento é rejeitado');

select lives_ok($$
  insert into public.event_requirements (event_id, catalog_version, category, item_code, label, unit, quantity, notes)
  values ('3aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'catalog-v1', 'outros', 'demanda_especifica', 'Demanda específica', 'pacote', 1, 'Tenda para chuva')
$$, 'Demanda específica (texto livre) é gravada em notes');

reset role;

-- Davi (outro usuário)
select set_config('request.jwt.claims',
  json_build_object('sub', '32222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*) from public.event_requirements), 0::bigint, 'Outro usuário não enxerga requisitos alheios');

select throws_ok($$
  insert into public.event_requirements (event_id, catalog_version, category, item_code, label, unit, quantity)
  values ('3aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'catalog-v1', 'gerador', 'gerador_energia', 'Gerador', 'por_hora', 5)
$$, '42501', null, 'Outro usuário não cria requisito em evento alheio');

reset role;
set local role anon;
select is((select count(*) from public.event_requirements), 0::bigint, 'anon não enxerga requisitos');

select * from finish();
rollback;
