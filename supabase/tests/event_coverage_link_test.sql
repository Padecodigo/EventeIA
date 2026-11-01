-- pgTAP: 0079 — event_coverage_summary (acesso do dono, privacidade, vínculo).
begin;
create extension if not exists pgtap;
select plan(6);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-cov@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Dono Cov"}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outro-cov@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Outro Cov"}'::jsonb, now(), now());

insert into public.events (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Festa', 'aniversario', '2026-12-20', 'SP', 50);

insert into public.prospect_conversations (id, channel, external_user_id)
values ('30000000-0000-4000-8000-000000000001', 'instagram', 'igsid-link-1'),
       ('30000000-0000-4000-8000-000000000002', 'instagram', 'igsid-link-2');
insert into public.supplier_conversations (event_id, channel, external_user_id)
values ('20000000-0000-4000-8000-000000000001', 'instagram', 'igsid-link-1');

insert into public.prospect_quotes (id, conversation_id, product) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'buffet'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'buffet');
insert into public.quote_item_coverage (prospect_quote_id, conversation_id, item_code, category, coverage, rounds_asked, evidence) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'garcons', 'buffet', 'included', 1, 'Buffet da Ana, 4 garçons'),
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'limpeza', 'buffet', 'unknown', 2, null),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'garcons', 'buffet', 'included', 1, null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.event_coverage_summary('20000000-0000-4000-8000-000000000001')), 2, 'dono vê só a cobertura das DMs ligadas ao evento');
select is((select a_confirmar from public.event_coverage_summary('20000000-0000-4000-8000-000000000001') where item_code = 'limpeza'), true, 'unknown após 2 rodadas = a confirmar');
select is((select distinct quote_label from public.event_coverage_summary('20000000-0000-4000-8000-000000000001')), 'Cotação 1', 'rótulo anônimo');
select is((select count(*)::int from public.event_coverage_summary('20000000-0000-4000-8000-000000000001') s where s::text like '%Buffet da Ana%'), 0, 'não expõe evidência do fornecedor');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select * from public.event_coverage_summary('20000000-0000-4000-8000-000000000001') $$, '42501', null, 'outro usuário não acessa');
reset role;

set local role anon;
select throws_ok($$ select * from public.event_coverage_summary('20000000-0000-4000-8000-000000000001') $$, '42501', null, 'anon não executa');
reset role;

select * from finish();
rollback;
