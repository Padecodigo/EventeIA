-- pgTAP: RLS das conversas de fornecedor nos canais Meta (0063) —
-- supplier_conversations e supplier_conversation_messages.
--
-- Regra (0063): escrita apenas service_role (workers/ingestão); leitura por admin
-- ou pelo dono do evento (via join quando a conversa está ligada a um evento).
-- Aqui verificamos: RLS habilitada e forçada; anon/não-dono não veem nem inserem;
-- dono lê só o do próprio evento; admin lê tudo; ninguém autenticado insere.
begin;

create extension if not exists pgtap;

select plan(17);

-- ============================================================
-- Fixtures (role postgres/superuser — ignora RLS)
-- ============================================================
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin-canais@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Admin Canais"}'::jsonb, now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-canais@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Dono Canais"}'::jsonb, now(), now()),
  ('eeeeeeee-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outro-canais@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Outro Canais"}'::jsonb, now(), now());

update public.profiles set role = 'admin' where id = 'cccccccc-0000-4000-8000-000000000001';

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002',
   'Festa do Dono', 'festa_infantil', '2026-12-10', 'sp', 40);

insert into public.suppliers (id, name, category, source_url, source_provider)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'Fornecedor Canais', 'buffet', 'https://exemplo.com.br', 'mock');

insert into public.supplier_conversations
  (id, event_id, supplier_id, channel, external_user_id, ref, window_kind, status)
values
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-000000000001', 'instagram', 'ext-1', 'event:aaaaaaaa-0000-4000-8000-000000000001', 'standard_24h', 'open'),
  ('cccccccc-0000-4000-8000-000000000002', null, null, 'messenger', 'ext-2', 'fornecedor', 'standard_24h', 'open');

insert into public.supplier_conversation_messages
  (id, conversation_id, direction, body, moderated)
values
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'in', 'olá', false);

-- ============================================================
-- RLS habilitada e forçada
-- ============================================================
select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in ('supplier_conversations','supplier_conversation_messages')
      and not c.relrowsecurity
    order by c.relname
  ),
  array[]::text[],
  'RLS habilitada nas 2 tabelas de canais Meta'
);

select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in ('supplier_conversations','supplier_conversation_messages')
      and not c.relforcerowsecurity
    order by c.relname
  ),
  array[]::text[],
  'RLS forçada nas 2 tabelas de canais Meta'
);

-- ============================================================
-- anon
-- ============================================================
set local role anon;

select is((select count(*) from public.supplier_conversations), 0::bigint, 'anon não vê conversas');
select throws_ok($$
  insert into public.supplier_conversations (channel, external_user_id)
  values ('instagram', 'ext-x')
$$, '42501', null, 'anon não insere conversa');

select is((select count(*) from public.supplier_conversation_messages), 0::bigint, 'anon não vê mensagens');
select throws_ok($$
  insert into public.supplier_conversation_messages (conversation_id, direction, body)
  values ('cccccccc-0000-4000-8000-000000000001', 'out', 'oi')
$$, '42501', null, 'anon não insere mensagem');

reset role;

-- ============================================================
-- não-dono autenticado
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'eeeeeeee-0000-4000-8000-000000000003', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.supplier_conversations), 0::bigint, 'não-dono não vê conversas');
select throws_ok($$
  insert into public.supplier_conversations (channel, external_user_id)
  values ('instagram', 'ext-y')
$$, '42501', null, 'não-dono não insere conversa');

select is((select count(*) from public.supplier_conversation_messages), 0::bigint, 'não-dono não vê mensagens');
select throws_ok($$
  insert into public.supplier_conversation_messages (conversation_id, direction, body)
  values ('cccccccc-0000-4000-8000-000000000001', 'out', 'oi')
$$, '42501', null, 'não-dono não insere mensagem');

reset role;

-- ============================================================
-- dono do evento
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-4000-8000-000000000002', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.supplier_conversations), 1::bigint, 'dono vê só a conversa do próprio evento');
select is((select count(*) from public.supplier_conversation_messages), 1::bigint, 'dono vê a mensagem da conversa do evento');
select throws_ok($$
  insert into public.supplier_conversations (channel, external_user_id)
  values ('instagram', 'ext-z')
$$, '42501', null, 'dono não insere conversa');
select throws_ok($$
  insert into public.supplier_conversation_messages (conversation_id, direction, body)
  values ('cccccccc-0000-4000-8000-000000000001', 'out', 'oi')
$$, '42501', null, 'dono não insere mensagem');

reset role;

-- ============================================================
-- admin (lê tudo, mas ninguém autenticado insere)
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.supplier_conversations), 2::bigint, 'admin lê todas as conversas');
select is((select count(*) from public.supplier_conversation_messages), 1::bigint, 'admin lê as mensagens');
select throws_ok($$
  insert into public.supplier_conversations (channel, external_user_id)
  values ('instagram', 'ext-w')
$$, '42501', null, 'nem admin insere conversa');

reset role;

select * from finish();
rollback;
