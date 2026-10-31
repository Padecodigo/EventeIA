-- pgTAP: RLS das opções de fornecedor e seleções de produtos (0065) —
-- supplier_options e supplier_selections.
--
-- Regra (0065): supplier_options — escrita/edição apenas admin; leitura pelo admin
-- ou pelo dono do evento cujo fornecedor está ligado (conversa Meta, cotação ou
-- prospecto). supplier_selections — leitura admin/dono; escrita dono/planner do evento.
begin;

create extension if not exists pgtap;

select plan(18);

-- ============================================================
-- Fixtures (role postgres/superuser — ignora RLS)
-- ============================================================
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaa1111-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin-opt@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Admin Opt"}'::jsonb, now(), now()),
  ('bbbb1111-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-opt@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Dono Opt"}'::jsonb, now(), now()),
  ('cccc1111-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outro-opt@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Outro Opt"}'::jsonb, now(), now());

update public.profiles set role = 'admin' where id = 'aaaa1111-0000-4000-8000-000000000001';

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values
  ('aaaa2222-0000-4000-8000-000000000001', 'bbbb1111-0000-4000-8000-000000000002',
   'Festa do Dono', 'festa_infantil', '2026-12-10', 'sp', 40);

insert into public.suppliers (id, name, category, source_url, source_provider)
values
  ('aaaa3333-0000-4000-8000-000000000001', 'Buffet do Vale', 'buffet', 'https://exemplo.com.br', 'mock'),
  ('aaaa3333-0000-4000-8000-000000000002', 'Louças do Vale', 'louca', 'https://exemplo.com.br', 'mock');

insert into public.supplier_conversations
  (id, event_id, supplier_id, channel, external_user_id, ref, window_kind, status)
values
  ('aaaa4444-0000-4000-8000-000000000001', 'aaaa2222-0000-4000-8000-000000000001',
   'aaaa3333-0000-4000-8000-000000000001', 'instagram', 'ext-1', 'event:aaaa2222-0000-4000-8000-000000000001', 'standard_24h', 'open');

insert into public.supplier_options
  (id, supplier_id, name, description, price_cents, unit, active)
values
  ('aaaa5555-0000-4000-8000-000000000001', 'aaaa3333-0000-4000-8000-000000000001', 'Churrasco', 'Carnes e acompanhamentos', 8900, 'por_pessoa', true),
  ('aaaa5555-0000-4000-8000-000000000002', 'aaaa3333-0000-4000-8000-000000000002', 'Jogo de louça', '120 peças', 15000, 'pacote', true);

insert into public.supplier_selections
  (event_id, supplier_id, option_id, option_snapshot, status)
values
  ('aaaa2222-0000-4000-8000-000000000001', 'aaaa3333-0000-4000-8000-000000000001',
   'aaaa5555-0000-4000-8000-000000000001', '{"name":"Churrasco"}'::jsonb, 'pendente');

-- ============================================================
-- RLS habilitada e forçada
-- ============================================================
select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in ('supplier_options','supplier_selections')
      and not c.relrowsecurity
    order by c.relname
  ),
  array[]::text[],
  'RLS habilitada nas 2 tabelas de seleção'
);

select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in ('supplier_options','supplier_selections')
      and not c.relforcerowsecurity
    order by c.relname
  ),
  array[]::text[],
  'RLS forçada nas 2 tabelas de seleção'
);

-- ============================================================
-- anon
-- ============================================================
set local role anon;

select throws_ok($$ select count(*) from public.supplier_options $$, '42501', null, 'anon não vê opções (sem grant)');
select throws_ok($$
  insert into public.supplier_options (supplier_id, name)
  values ('aaaa3333-0000-4000-8000-000000000001', 'opcao x')
$$, '42501', null, 'anon não insere opção');

select is((select count(*) from public.supplier_selections), 0::bigint, 'anon não vê seleções');
select throws_ok($$
  insert into public.supplier_selections (event_id, supplier_id)
  values ('aaaa2222-0000-4000-8000-000000000001', 'aaaa3333-0000-4000-8000-000000000001')
$$, '42501', null, 'anon não insere seleção');

reset role;

-- ============================================================
-- não-dono autenticado
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'cccc1111-0000-4000-8000-000000000003', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.supplier_options), 0::bigint, 'não-dono não vê opções');
select is((select count(*) from public.supplier_selections), 0::bigint, 'não-dono não vê seleções');
select throws_ok($$
  insert into public.supplier_selections (event_id, supplier_id)
  values ('aaaa2222-0000-4000-8000-000000000001', 'aaaa3333-0000-4000-8000-000000000001')
$$, '42501', null, 'não-dono não insere seleção');

reset role;

-- ============================================================
-- dono do evento
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'bbbb1111-0000-4000-8000-000000000002', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.supplier_options), 1::bigint, 'dono vê só a opção do fornecedor ligado ao evento');
select is((select count(*) from public.supplier_selections), 1::bigint, 'dono vê a seleção do próprio evento');
select throws_ok($$
  insert into public.supplier_options (supplier_id, name)
  values ('aaaa3333-0000-4000-8000-000000000001', 'opcao do dono')
$$, '42501', null, 'dono não cria opção (escrita é admin)');
select lives_ok($$
  insert into public.supplier_selections (event_id, supplier_id)
  values ('aaaa2222-0000-4000-8000-000000000001', 'aaaa3333-0000-4000-8000-000000000002')
$$, 'dono insere seleção do próprio evento');
select is((select count(*) from public.supplier_selections), 2::bigint, 'seleção do dono foi gravada');

reset role;

-- ============================================================
-- admin
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaa1111-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.supplier_options), 2::bigint, 'admin lê todas as opções');
select lives_ok($$
  insert into public.supplier_options (supplier_id, name)
  values ('aaaa3333-0000-4000-8000-000000000001', 'Jantar completo')
$$, 'admin cria opção');
select is((select count(*) from public.supplier_options), 3::bigint, 'opção criada pelo admin');
select is((select count(*) from public.supplier_selections), 2::bigint, 'admin lê todas as seleções');

reset role;

select * from finish();
rollback;
