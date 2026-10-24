-- pgTAP: cache global de fornecedores, prospects únicos e runs (0016).
begin;

create extension if not exists pgtap;

select plan(8);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('41111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'eva@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Eva"}'::jsonb, now(), now()),
  ('42222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fabio@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Fabio"}'::jsonb, now(), now());

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, city)
values
  ('4aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '41111111-1111-1111-1111-111111111111',
   'Festa da Eva', 'casamento', '2026-12-10', 'sp', 80, 'Jacareí');

select throws_ok($$
  insert into public.suppliers (name, category, phone_e164, source_url, source_provider)
  values ('Inválido', 'buffet', '+1555123', 'https://x.com', 'mock')
$$, '23514', null, 'Telefone fora do padrão +55 é rejeitado');

select lives_ok($$
  insert into public.suppliers (name, category, phone_e164, source_url, source_provider, city)
  values ('Buffet Teste', 'buffet', '+5512900001234', 'https://exemplo.com.br', 'mock', 'Jacareí')
$$, 'Fornecedor válido entra no cache global');

select throws_ok($$
  insert into public.suppliers (name, category, phone_e164, source_url, source_provider)
  values ('Duplicado', 'buffet', '+5512900001234', 'https://exemplo.com.br', 'mock')
$$, '23505', null, 'Telefone único no cache global');

select lives_ok($$
  insert into public.vendor_prospects (event_id, vendor_name, vendor_category, phone_e164, source, dry_run)
  values ('4aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Buffet Teste', 'buffet', '+5512900001234', 'auto', true)
$$, 'Prospect automático em dry-run');

select throws_ok($$
  insert into public.vendor_prospects (event_id, vendor_name, vendor_category, phone_e164, source)
  values ('4aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Buffet Teste', 'buffet', '+5512900001234', 'auto')
$$, '23505', null, 'Mesmo telefone não é prospectado 2x no mesmo evento');

insert into public.supplier_discovery_runs (event_id, provider, category, round, found, inserted, enqueued, status)
values ('4aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'mock', 'buffet', 0, 3, 1, 1, 'ok');

-- Eva (dona): vê runs do próprio evento, não vê o cache global
select set_config('request.jwt.claims',
  json_build_object('sub', '41111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.supplier_discovery_runs), 1::bigint, 'Dona vê as rodadas do evento');
select is((select count(*) from public.suppliers), 0::bigint, 'Cache global não é exposto a usuários');
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', '42222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.supplier_discovery_runs), 0::bigint, 'Outro usuário não vê rodadas alheias');
reset role;

select * from finish();
rollback;
