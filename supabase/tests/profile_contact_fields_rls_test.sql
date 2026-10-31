-- pgTAP: campos opcionais de contato do perfil (WhatsApp + Instagram) — RLS.
-- O usuário só pode atualizar a PRÓPRIA linha e apenas as colunas editáveis
-- (0002 + 0064). Valida também o privilégio de coluna para authenticated.
begin;

create extension if not exists pgtap;

select plan(6);

-- ============================================================
-- Fixtures (role superuser — ignora RLS)
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

-- Bob já tem contatos preenchidos (escrita como superuser).
update public.profiles
set contact_whatsapp_e164 = '+5521999998888', instagram_handle = 'bob.planner'
where id = '22222222-2222-2222-2222-222222222222';

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'contact_whatsapp_e164', 'UPDATE'),
  'authenticated pode atualizar contact_whatsapp_e164');

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'instagram_handle', 'UPDATE'),
  'authenticated pode atualizar instagram_handle');

-- ============================================================
-- Alice (dona do próprio perfil)
-- ============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true);
set local role authenticated;

update public.profiles
set contact_whatsapp_e164 = '+5511999997777', instagram_handle = 'alice.anfitria'
where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select contact_whatsapp_e164 from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  '+5511999997777', 'dona atualiza o próprio WhatsApp');

select is(
  (select instagram_handle from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'alice.anfitria', 'dona atualiza o próprio Instagram');

-- Alice tenta sobrescrever o contato do Bob: RLS limita a linha → 0 linhas.
update public.profiles
set contact_whatsapp_e164 = '+5511888887777', instagram_handle = 'atacante'
where id = '22222222-2222-2222-2222-222222222222';

-- Volta a superuser para verificar o valor real do Bob (Alice não lê o perfil dele).
reset role;

select is(
  (select contact_whatsapp_e164 from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  '+5521999998888', 'não altera o WhatsApp de outro usuário');

select is(
  (select instagram_handle from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'bob.planner', 'não altera o Instagram de outro usuário');

select * from finish();
rollback;
