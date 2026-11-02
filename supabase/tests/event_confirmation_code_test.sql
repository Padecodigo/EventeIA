-- pgTAP: código de confirmação do evento (0082). Rollback ao final.
begin;
create extension if not exists pgtap;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('c8211111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conf-a@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.events (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, status)
values ('e8211111-1111-4111-8111-111111111111', 'c8211111-1111-4111-8111-111111111111', 'Conf', 'casamento', '2027-01-10', 'sp', 50, 'draft');

select matches((select confirmation_code from public.events where id = 'e8211111-1111-4111-8111-111111111111'),
  '^EVT-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$', 'Código gerado no insert com alfabeto sem ambíguos');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c8211111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok($$ insert into public.events (owner_profile_id, title, event_type, event_date, region_code, guest_count, confirmed_at, confirmation_code)
  values ('c8211111-1111-4111-8111-111111111111', 'Cliente', 'casamento', '2027-02-10', 'sp', 30, now(), 'EVT-222222') $$, 'Cliente cria evento');
reset role;
select ok((select confirmed_at is null and confirmation_code <> 'EVT-222222' from public.events where title = 'Cliente'), 'Insert do cliente ignora código/confirmação enviados');
select is((select confirmed_at from public.events where id = 'e8211111-1111-4111-8111-111111111111'), null, 'Evento novo nasce não confirmado');
select col_not_null('public', 'events', 'confirmation_code', 'confirmation_code NOT NULL');
select has_index('public', 'events', 'events_confirmation_code_key', 'Índice único case-insensitive');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c8211111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ update public.events set confirmed_at = now() where id = 'e8211111-1111-4111-8111-111111111111' $$, '42501', null, 'Cliente não pode se autoconfirmar');
select throws_ok($$ update public.events set confirmation_code = 'EVT-222222' where id = 'e8211111-1111-4111-8111-111111111111' $$, '42501', null, 'Cliente não pode trocar o código');
reset role;
set local role anon;
select throws_ok($$ select public.generate_event_confirmation_code() $$, '42501', null, 'Gerador não é executável por anon');
reset role;

update public.events set confirmed_at = now() where id = 'e8211111-1111-4111-8111-111111111111';
select isnt((select confirmed_at from public.events where id = 'e8211111-1111-4111-8111-111111111111'), null, 'Servidor (service role) confirma');

select * from finish();
rollback;
