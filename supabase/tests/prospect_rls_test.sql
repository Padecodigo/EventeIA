-- pgTAP: RLS das tabelas do fluxo de prospecção (0053) — prospect_posts,
-- prospect_conversations, prospect_messages, prospect_quotes.
--
-- Regra (0053): leitura restrita ao admin (public.is_admin()); escrita nenhuma via
-- client — só service_role (workers/ingestão). Aqui verificamos:
--   * RLS habilitada E forçada nas 4 tabelas;
--   * anon não vê nem insere;
--   * não-admin autenticado vê 0 linhas e não insere/atualiza/apaga;
--   * admin lê;
--   * ninguém autenticado insere (nem admin).
begin;

create extension if not exists pgtap;

select plan(34);

-- ============================================================
-- Fixtures (role postgres/superuser — ignora RLS)
-- ============================================================
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin-prospec@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Admin Prospec"}'::jsonb, now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cliente-prospec@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Cliente Prospec"}'::jsonb, now(), now());

update public.profiles set role = 'admin' where id = 'cccccccc-0000-4000-8000-000000000001';

insert into public.suppliers (id, name, category, source_url, source_provider)
values ('eeeeeeee-0000-4000-8000-000000000001', 'Fornecedor Prospec', 'buffet', 'https://exemplo.com.br', 'mock');

insert into public.prospect_posts (id, caption, status)
values ('eeeeeeee-0000-4000-8000-000000000002', 'Isca de prospecção de teste', 'approved');

insert into public.prospect_conversations (id, supplier_id, channel, external_user_id, status)
values ('eeeeeeee-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000001', 'instagram', 'ext-user-1', 'open');

insert into public.prospect_messages (id, conversation_id, direction, body)
values ('eeeeeeee-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000003', 'out', 'Olá, fornecedor!');

insert into public.prospect_quotes (id, conversation_id, supplier_id, product, status)
values ('eeeeeeee-0000-4000-8000-000000000005', 'eeeeeeee-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000001', 'Buffet completo', 'confirmed');

-- ============================================================
-- RLS habilitada e forçada nas 4 tabelas do fluxo
-- ============================================================
select is(
  array(
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in ('prospect_posts','prospect_conversations','prospect_messages','prospect_quotes')
      and not c.relrowsecurity
    order by c.relname
  ),
  array[]::text[],
  'RLS habilitada nas 4 tabelas de prospecção'
);

select is(
  array(
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname in ('prospect_posts','prospect_conversations','prospect_messages','prospect_quotes')
      and not c.relforcerowsecurity
    order by c.relname
  ),
  array[]::text[],
  'RLS forçada nas 4 tabelas de prospecção'
);

-- ============================================================
-- anon
-- ============================================================
set local role anon;

select is((select count(*) from public.prospect_posts), 0::bigint, 'anon não vê prospect_posts');
select throws_ok($$
  insert into public.prospect_posts (caption) values ('Isca')
$$, '42501', null, 'anon não insere prospect_posts');

select is((select count(*) from public.prospect_conversations), 0::bigint, 'anon não vê prospect_conversations');
select throws_ok($$
  insert into public.prospect_conversations (supplier_id, channel, external_user_id)
  values ('eeeeeeee-0000-4000-8000-000000000001', 'instagram', 'ext-x')
$$, '42501', null, 'anon não insere prospect_conversations');

select is((select count(*) from public.prospect_messages), 0::bigint, 'anon não vê prospect_messages');
select throws_ok($$
  insert into public.prospect_messages (conversation_id, direction, body)
  values ('eeeeeeee-0000-4000-8000-000000000003', 'out', 'oi')
$$, '42501', null, 'anon não insere prospect_messages');

select is((select count(*) from public.prospect_quotes), 0::bigint, 'anon não vê prospect_quotes');
select throws_ok($$
  insert into public.prospect_quotes (conversation_id, supplier_id, product)
  values ('eeeeeeee-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000001', 'Buffet')
$$, '42501', null, 'anon não insere prospect_quotes');

reset role;

-- ============================================================
-- não-admin autenticado
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'dddddddd-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.prospect_posts), 0::bigint, 'não-admin não vê prospect_posts');
select throws_ok($$
  insert into public.prospect_posts (caption) values ('Isca')
$$, '42501', null, 'não-admin não insere prospect_posts');
select is(
  (select count(*) from (update public.prospect_posts set status = 'failed'
   where id = 'eeeeeeee-0000-4000-8000-000000000002' returning 1) as x),
  0::bigint, 'não-admin não atualiza prospect_posts');
select is(
  (select count(*) from (delete from public.prospect_posts
   where id = 'eeeeeeee-0000-4000-8000-000000000002' returning 1) as x),
  0::bigint, 'não-admin não apaga prospect_posts');

select is((select count(*) from public.prospect_conversations), 0::bigint, 'não-admin não vê prospect_conversations');
select throws_ok($$
  insert into public.prospect_conversations (supplier_id, channel, external_user_id)
  values ('eeeeeeee-0000-4000-8000-000000000001', 'instagram', 'ext-x')
$$, '42501', null, 'não-admin não insere prospect_conversations');
select is(
  (select count(*) from (update public.prospect_conversations set status = 'closed'
   where id = 'eeeeeeee-0000-4000-8000-000000000003' returning 1) as x),
  0::bigint, 'não-admin não atualiza prospect_conversations');
select is(
  (select count(*) from (delete from public.prospect_conversations
   where id = 'eeeeeeee-0000-4000-8000-000000000003' returning 1) as x),
  0::bigint, 'não-admin não apaga prospect_conversations');

select is((select count(*) from public.prospect_messages), 0::bigint, 'não-admin não vê prospect_messages');
select throws_ok($$
  insert into public.prospect_messages (conversation_id, direction, body)
  values ('eeeeeeee-0000-4000-8000-000000000003', 'out', 'oi')
$$, '42501', null, 'não-admin não insere prospect_messages');
select is(
  (select count(*) from (update public.prospect_messages set body = 'alterado'
   where id = 'eeeeeeee-0000-4000-8000-000000000004' returning 1) as x),
  0::bigint, 'não-admin não atualiza prospect_messages');
select is(
  (select count(*) from (delete from public.prospect_messages
   where id = 'eeeeeeee-0000-4000-8000-000000000004' returning 1) as x),
  0::bigint, 'não-admin não apaga prospect_messages');

select is((select count(*) from public.prospect_quotes), 0::bigint, 'não-admin não vê prospect_quotes');
select throws_ok($$
  insert into public.prospect_quotes (conversation_id, supplier_id, product)
  values ('eeeeeeee-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000001', 'Buffet')
$$, '42501', null, 'não-admin não insere prospect_quotes');
select is(
  (select count(*) from (update public.prospect_quotes set status = 'expired'
   where id = 'eeeeeeee-0000-4000-8000-000000000005' returning 1) as x),
  0::bigint, 'não-admin não atualiza prospect_quotes');
select is(
  (select count(*) from (delete from public.prospect_quotes
   where id = 'eeeeeeee-0000-4000-8000-000000000005' returning 1) as x),
  0::bigint, 'não-admin não apaga prospect_quotes');

reset role;

-- ============================================================
-- admin (lê, mas ninguém autenticado insere)
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is((select count(*) from public.prospect_posts), 1::bigint, 'admin lê prospect_posts');
select throws_ok($$
  insert into public.prospect_posts (caption) values ('Isca')
$$, '42501', null, 'nem admin insere prospect_posts');

select is((select count(*) from public.prospect_conversations), 1::bigint, 'admin lê prospect_conversations');
select throws_ok($$
  insert into public.prospect_conversations (supplier_id, channel, external_user_id)
  values ('eeeeeeee-0000-4000-8000-000000000001', 'instagram', 'ext-y')
$$, '42501', null, 'nem admin insere prospect_conversations');

select is((select count(*) from public.prospect_messages), 1::bigint, 'admin lê prospect_messages');
select throws_ok($$
  insert into public.prospect_messages (conversation_id, direction, body)
  values ('eeeeeeee-0000-4000-8000-000000000003', 'out', 'oi')
$$, '42501', null, 'nem admin insere prospect_messages');

select is((select count(*) from public.prospect_quotes), 1::bigint, 'admin lê prospect_quotes');
select throws_ok($$
  insert into public.prospect_quotes (conversation_id, supplier_id, product)
  values ('eeeeeeee-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000001', 'Buffet')
$$, '42501', null, 'nem admin insere prospect_quotes');

reset role;

select * from finish();
rollback;
