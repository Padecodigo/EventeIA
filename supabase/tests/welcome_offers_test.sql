-- pgTAP: oferta de boas-vindas (0022) — prazo real no banco, 1 por IP/aparelho/conta, RLS e rate limit.
begin;
create extension if not exists pgtap;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-bv@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente-bv@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('c3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outro-bv@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now());
update public.profiles set role = 'admin' where id = 'a1111111-1111-4111-8111-111111111111';

-- hashes fictícios (64 hex)
create temp table h as select repeat('a', 64) as ip1, repeat('b', 64) as dev1, repeat('c', 64) as dev2, repeat('d', 64) as ip2, repeat('e', 64) as dev3;
grant select on h to authenticated;

select is((select status from public.welcome_offer_lookup((select ip1 from h), (select dev1 from h), null, 'promo', false)), 'none', 'Consulta sem emissão não cria oferta');
select is((select status from public.welcome_offer_lookup((select ip1 from h), (select dev1 from h), null, 'promo', true)), 'active', 'Novo IP + aparelho recebe oferta ativa');
select ok((select created from public.welcome_offer_lookup((select ip1 from h), (select dev1 from h), null, 'promo', true)) = false, 'Recarregar não recria a oferta');
select ok((select abs(extract(epoch from (expires_at - created_at)) - 86400) < 1 from public.welcome_offers), 'Prazo de 24h definido pelo banco');
select is((select expires_at from public.welcome_offer_lookup((select ip1 from h), (select dev1 from h), null, 'promo', true)), (select expires_at from public.welcome_offers), 'Contagem não reinicia em novo acesso');
select is((select status from public.welcome_offer_lookup((select ip1 from h), (select dev2 from h), null, 'new_ip', true)), 'ineligible', 'Mesmo IP em outro aparelho não ganha nova oferta');
select is((select count(*) from public.welcome_offers), 1::bigint, 'Só uma oferta por IP');
select throws_ok($$ select * from public.welcome_offer_lookup('1.2.3.4', repeat('b', 64), null, 'promo', true) $$, '22023', null, 'IP bruto (não-hash) é rejeitado');

-- Vínculo à conta
select is((select status from public.welcome_offer_lookup((select ip1 from h), (select dev1 from h), 'b2222222-2222-4222-8222-222222222222', 'promo', false)), 'active', 'Cadastro vincula a oferta à conta');
select is((select profile_id from public.welcome_offers), 'b2222222-2222-4222-8222-222222222222'::uuid, 'profile_id gravado');
select is((select status from public.welcome_offer_lookup((select ip1 from h), (select dev1 from h), 'c3333333-3333-4333-8333-333333333333', 'promo', false)), 'ineligible', 'Outra conta não herda a oferta do aparelho');

-- Reserva no checkout (1 evento)
insert into public.events (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, status)
values ('e1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222', 'Festa', 'aniversario', '2027-01-10', 'sp', 50, 'draft'),
       ('e2222222-2222-4222-8222-222222222222', 'b2222222-2222-4222-8222-222222222222', 'Festa 2', 'aniversario', '2027-01-11', 'sp', 50, 'draft');
select is((select count(*) from public.welcome_offer_reserve('b2222222-2222-4222-8222-222222222222', 'e1111111-1111-4111-8111-111111111111')), 1::bigint, 'Reserva para o 1º evento');
select is((select count(*) from public.welcome_offer_reserve('b2222222-2222-4222-8222-222222222222', 'e2222222-2222-4222-8222-222222222222')), 0::bigint, 'Não vale para um 2º evento');

-- Expirada (prazo do banco) não é reservável nem volta a aparecer
update public.welcome_offers set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour';
select is((select count(*) from public.welcome_offer_reserve('b2222222-2222-4222-8222-222222222222', 'e1111111-1111-4111-8111-111111111111')), 0::bigint, 'Expirada não é reservável');
select is((select status || coalesce(code, '-') from public.welcome_offer_lookup((select ip1 from h), (select dev1 from h), null, 'promo', true)), 'expired-', 'Expirada não reaparece nem expõe código');

-- RLS e privilégios
select set_config('request.jwt.claims', json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.welcome_offers), 0::bigint, 'Cliente não lê ofertas (nem a própria — sem enumeração)');
select throws_ok($$ select * from public.welcome_offer_lookup(repeat('d', 64), repeat('e', 64), null, 'promo', true) $$, '42501', null, 'authenticated não executa a emissão');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.welcome_offers), 1::bigint, 'Admin lê ofertas');
reset role;

select * from finish();
rollback;
