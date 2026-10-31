-- pgTAP: RLS de contact_handoff_consents (0068).
--
-- Regra: o usuário lê e registra apenas o próprio consentimento. O status do
-- repasse (delivery_status/delivered_at/consent_text) NÃO pode ser alterado por
-- authenticated — só o service_role (servidor) atualiza. anon não tem acesso.
begin;

create extension if not exists pgtap;

select plan(10);

-- ============================================================
-- Fixtures (role superuser — ignora RLS)
-- ============================================================
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d0a00000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dona-handoff@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(),
   '{}'::jsonb, '{"full_name":"Dona Handoff"}'::jsonb, now(), now()),
  ('d0a00000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outra-handoff@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(),
   '{}'::jsonb, '{"full_name":"Outra Handoff"}'::jsonb, now(), now());

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values
  ('d0a10000-0000-4000-8000-000000000001', 'd0a00000-0000-4000-8000-000000000001',
   'Festa da Dona', 'festa_infantil', '2026-12-20', 'sp', 30);

insert into public.quotations
  (id, event_id, category, vendor_name, amount_cents, engine_version)
values
  ('d0a20000-0000-4000-8000-000000000001', 'd0a10000-0000-4000-8000-000000000001',
   'buffet', 'Buffet da Dona', 500000, 'v1');

-- ============================================================
-- Estrutura: RLS habilitada/forçada e sem policy de UPDATE
-- ============================================================
select is(
  (select relrowsecurity from pg_class where oid = 'public.contact_handoff_consents'::regclass),
  true, 'RLS habilitada');

select is(
  (select relforcerowsecurity from pg_class where oid = 'public.contact_handoff_consents'::regclass),
  true, 'RLS forçada');

select is(
  (select count(*) from pg_policies
   where schemaname = 'public'
     and tablename = 'contact_handoff_consents'
     and cmd = 'UPDATE'),
  0::bigint, 'nenhuma policy de UPDATE para usuário');

-- ============================================================
-- Dono do evento
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'd0a00000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select lives_ok($$
  insert into public.contact_handoff_consents
    (event_id, quotation_id, profile_id, consent_text, consent_version)
  values
    ('d0a10000-0000-4000-8000-000000000001', 'd0a20000-0000-4000-8000-000000000001',
     'd0a00000-0000-4000-8000-000000000001', 'Autorizo o repasse do meu contato.', '2026-10-31-v1')
$$, 'dona registra o próprio consentimento');

select is(
  (select count(*) from public.contact_handoff_consents),
  1::bigint, 'dona vê o próprio consentimento');

select throws_ok($$
  update public.contact_handoff_consents
  set delivery_status = 'repassado', delivered_at = now(),
      consent_text = 'texto forjado'
$$, '42501', null, 'authenticated não forja status/consentimento via UPDATE');

reset role;

-- ============================================================
-- Outro usuário autenticado
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', 'd0a00000-0000-4000-8000-000000000002', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select is(
  (select count(*) from public.contact_handoff_consents),
  0::bigint, 'outro usuário não vê consentimentos alheios');

select throws_ok($$
  insert into public.contact_handoff_consents
    (event_id, quotation_id, profile_id, consent_text, consent_version)
  values
    ('d0a10000-0000-4000-8000-000000000001', 'd0a20000-0000-4000-8000-000000000001',
     'd0a00000-0000-4000-8000-000000000002', 'Autorizo o repasse do meu contato.', '2026-10-31-v1')
$$, '42501', null, 'outro usuário não insere consentimento em evento alheio');

reset role;

-- ============================================================
-- anon
-- ============================================================
set local role anon;

select throws_ok($$ select count(*) from public.contact_handoff_consents $$,
  '42501', null, 'anon não lê consentimentos');

select throws_ok($$
  insert into public.contact_handoff_consents
    (event_id, quotation_id, profile_id, consent_text, consent_version)
  values
    ('d0a10000-0000-4000-8000-000000000001', 'd0a20000-0000-4000-8000-000000000001',
     'd0a00000-0000-4000-8000-000000000001', 'Autorizo o repasse do meu contato.', '2026-10-31-v1')
$$, '42501', null, 'anon não insere consentimentos');

reset role;

select * from finish();
rollback;
