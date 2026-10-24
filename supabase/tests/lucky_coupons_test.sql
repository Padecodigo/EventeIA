-- pgTAP: cupom sorteado + perda da boas-vindas na 2ª visita (0025).
begin;
create extension if not exists pgtap;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-lk@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente-lk@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now());
update public.profiles set role = 'admin' where id = 'a1111111-1111-4111-8111-111111111111';

create temp table h as select repeat('a', 64) as ip1, repeat('b', 64) as dev1, repeat('1', 64) as visit1, repeat('2', 64) as visit2;

-- 1ª visita: boas-vindas ativa ⇒ sorteio inelegível (nunca as duas juntas)
select is((select status from public.welcome_offer_lookup((select ip1 from h), (select dev1 from h), null, 'promo', true)), 'active', 'Boas-vindas emitida');
select is(public.welcome_offer_touch_visit((select dev1 from h), null, (select visit1 from h)), 'bound', 'Oferta presa à 1ª visita');
select is(public.welcome_offer_touch_visit((select dev1 from h), null, (select visit1 from h)), 'same_visit', 'Recarregar na mesma visita mantém');
select is((select status from public.lucky_coupon_lookup((select ip1 from h), (select dev1 from h), null, null, 48, 24)), 'ineligible', 'Sem botão enquanto boas-vindas ativa');
select is((select status from public.lucky_coupon_lookup((select ip1 from h), (select dev1 from h), null, 30, 48, 24)), 'ineligible', 'Nem sorteia enquanto boas-vindas ativa');

-- 2ª visita (mais tarde): R$ 47 perdido para sempre
update public.welcome_offers set created_at = now() - interval '2 hours', expires_at = now() + interval '22 hours' where device_hash = repeat('b', 64);
select is(public.welcome_offer_touch_visit((select dev1 from h), null, (select visit2 from h)), 'forfeited', 'Visita nova perde a oferta');
select ok((select forfeited_at is not null and expires_at <= now() from public.welcome_offers where device_hash = repeat('b', 64)), 'forfeited_at gravado e prazo encerrado');
select is((select status || coalesce(code, '-') from public.welcome_offer_lookup((select ip1 from h), (select dev1 from h), null, 'promo', true)), 'expired-', 'R$ 47 não reaparece');
select is(public.welcome_offer_touch_visit((select dev1 from h), null, (select visit1 from h)), 'noop', 'Voltar à visita antiga não ressuscita');

-- Sorteio
select is((select status from public.lucky_coupon_lookup((select ip1 from h), (select dev1 from h), null, null, 48, 24)), 'available', 'Botão "Quer cupom?" disponível');
select is((select count(*) from public.lucky_coupons where device_hash = repeat('b', 64)), 0::bigint, 'Consulta não sorteia');
select throws_ok($$ select * from public.lucky_coupon_lookup(repeat('a', 64), repeat('b', 64), null, 41, 48, 24) $$, '22023', null, '41% rejeitado');
select throws_ok($$ select * from public.lucky_coupon_lookup(repeat('a', 64), repeat('b', 64), null, 19, 48, 24) $$, '22023', null, '19% rejeitado');
select throws_ok($$ select * from public.lucky_coupon_lookup(repeat('a', 64), repeat('b', 64), null, 30, 48, 72) $$, '22023', null, 'Validade maior que a janela rejeitada');
select is((select percent from public.lucky_coupon_lookup((select ip1 from h), (select dev1 from h), null, 27, 48, 24)), 27, 'Sorteio gravado (27%)');
select is((select percent::text || created::text from public.lucky_coupon_lookup((select ip1 from h), (select dev1 from h), null, 39, 48, 24)), '27false', 'Tentar de novo na hora = mesmo cupom (bloqueado)');
select is((select count(*) from public.lucky_coupons where device_hash = repeat('b', 64)), 1::bigint, 'Um sorteio por janela');
select ok((select abs(extract(epoch from (redraw_at - created_at)) - 172800) < 1 and abs(extract(epoch from (expires_at - created_at)) - 86400) < 1 from public.lucky_coupons where device_hash = repeat('b', 64)), 'Janela 48h, validade 24h (banco)');

-- Checkout
select is((select status from public.lucky_coupon_lookup((select ip1 from h), (select dev1 from h), 'b2222222-2222-4222-8222-222222222222', null, 48, 24)), 'active', 'Vincula à conta');
insert into public.events (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, status)
values ('e1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222', 'Festa', 'aniversario', '2027-01-10', 'sp', 50, 'draft');
select is((select percent from public.lucky_coupon_reserve('b2222222-2222-4222-8222-222222222222', 'e1111111-1111-4111-8111-111111111111')), 27, 'Checkout usa o percentual do banco');

-- Após 48h: novo sorteio invalida o anterior
update public.lucky_coupons set created_at = now() - interval '49 hours', expires_at = now() - interval '25 hours', redraw_at = now() - interval '1 hour' where device_hash = repeat('b', 64);
select is((select percent::text || created::text from public.lucky_coupon_lookup((select ip1 from h), (select dev1 from h), 'b2222222-2222-4222-8222-222222222222', 33, 48, 24)), '33true', 'Após 48h sorteia de novo');
select is((select count(*) from public.lucky_coupons where device_hash = repeat('b', 64) and superseded_at is not null), 1::bigint, 'Cupom anterior invalidado');
select is((select percent from public.lucky_coupon_reserve('b2222222-2222-4222-8222-222222222222', 'e1111111-1111-4111-8111-111111111111')), 33, 'Só o novo cupom vale no checkout');

-- RLS e privilégios
select set_config('request.jwt.claims', json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ select * from public.lucky_coupon_lookup(repeat('d', 64), repeat('e', 64), null, 30, 48, 24) $$, '42501', null, 'authenticated não sorteia direto');
reset role;

select * from finish();
rollback;
