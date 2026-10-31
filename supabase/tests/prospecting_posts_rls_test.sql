-- pgTAP: RLS dos posts de prospecção por evento (0066) — prospecting_posts.
--
-- Regra (0066): escrita apenas por service_role (server actions/workers);
-- leitura restrita ao admin. Aqui verificamos: RLS habilitada e forçada; anon e
-- usuário comum não veem; ninguém autenticado insere; admin lê tudo.
begin;

create extension if not exists pgtap;

select plan(8);

-- ============================================================
-- Fixtures (role postgres/superuser — ignora RLS)
-- ============================================================
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1a1a1a1-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin-prospect-post@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Admin Post"}'::jsonb, now(), now()),
  ('a1a1a1a1-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-prospect-post@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Dono Post"}'::jsonb, now(), now());

update public.profiles set role = 'admin' where id = 'a1a1a1a1-0000-4000-8000-000000000001';

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values
  ('a1a1a1a1-0000-4000-8000-000000000010', 'a1a1a1a1-0000-4000-8000-000000000002',
   'Evento privado', 'casamento', '2026-12-10', 'sp', 80);

insert into public.prospecting_posts
  (id, event_id, event_code, event_type, event_date, city, region, caption, image_url, status)
values
  ('a1a1a1a1-0000-4000-8000-000000000020', 'a1a1a1a1-0000-4000-8000-000000000010',
   'EVT-A1A1A1A1', 'casamento', '2026-12-10', 'Taubaté', 'SP',
   'Estamos buscando fornecedores — se você está livre nessa data, chama no Direct.', null, 'draft');

-- ============================================================
-- RLS habilitada e forçada
-- ============================================================
select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname = 'prospecting_posts' and not c.relrowsecurity
  ),
  array[]::text[],
  'RLS habilitada em prospecting_posts'
);

select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname = 'prospecting_posts' and not c.relforcerowsecurity
  ),
  array[]::text[],
  'RLS forçada em prospecting_posts'
);

-- ============================================================
-- anon
-- ============================================================
set local role anon;

select is((select count(*) from public.prospecting_posts), 0::bigint, 'anon não vê posts de prospecção');
select throws_ok($$
  insert into public.prospecting_posts
    (event_id, event_code, event_type, event_date, caption)
  values ('a1a1a1a1-0000-4000-8000-000000000010', 'EVT-ANON0000', 'casamento', '2026-12-10', 'x')
$$, '42501', null, 'anon não insere post de prospecção');

reset role;

-- ============================================================
-- usuário comum (não admin)
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'a1a1a1a1-0000-4000-8000-000000000002', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.prospecting_posts), 0::bigint, 'não-admin não vê posts de prospecção');
select throws_ok($$
  insert into public.prospecting_posts
    (event_id, event_code, event_type, event_date, caption)
  values ('a1a1a1a1-0000-4000-8000-000000000010', 'EVT-USER0000', 'casamento', '2026-12-10', 'x')
$$, '42501', null, 'não-admin não insere post de prospecção');

reset role;

-- ============================================================
-- admin (lê tudo, mas ninguém autenticado insere)
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'a1a1a1a1-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.prospecting_posts), 1::bigint, 'admin lê os posts de prospecção');
select throws_ok($$
  insert into public.prospecting_posts
    (event_id, event_code, event_type, event_date, caption)
  values ('a1a1a1a1-0000-4000-8000-000000000010', 'EVT-ADMIN000', 'casamento', '2026-12-10', 'x')
$$, '42501', null, 'nem admin insere post de prospecção');

reset role;

select * from finish();
rollback;
