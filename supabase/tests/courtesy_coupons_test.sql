-- pgTAP: cortesia (0030), uso único por usuário e reserva atômica. Rollback ao final.
begin;
create extension if not exists pgtap;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('c1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cort-a@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('c2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cort-b@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.events (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, status)
values
  ('e1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'A1', 'casamento', '2027-01-10', 'sp', 50, 'draft'),
  ('e1111112-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'A2', 'casamento', '2027-01-11', 'sp', 50, 'draft'),
  ('e2222222-2222-4222-8222-222222222222', 'c2222222-2222-4222-8222-222222222222', 'B1', 'casamento', '2027-01-12', 'sp', 50, 'draft');

insert into public.coupons (code, discount_type, value, max_redemptions)
values ('PGTAP-FREE', 'free', 1, 1), ('PGTAP-10', 'percent', 10, null);

-- Cortesia
select is(public.redeem_courtesy_coupon('PGTAP-FREE', 'c2222222-2222-4222-8222-222222222222', 'e1111111-1111-4111-8111-111111111111'),
  'event_not_found', 'não resgata em evento de outra pessoa');
select is(public.redeem_courtesy_coupon('PGTAP-FREE', 'c1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111'),
  'activated', 'cortesia ativa o evento');
select is((select status from public.events where id = 'e1111111-1111-4111-8111-111111111111'), 'active', 'evento ativo');
select is((select status from public.event_tickets where event_id = 'e1111111-1111-4111-8111-111111111111'), 'active', 'tíquete ativo');
select is((select status || ':' || billing_type || ':' || amount_cents from public.payments where event_id = 'e1111111-1111-4111-8111-111111111111'),
  'paid:COURTESY:0', 'pagamento de cortesia pago com total 0');
select is((select redemptions from public.coupons where code = 'PGTAP-FREE'), 1, 'redenção contada (trigger 0010)');
select is((select status from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id where c.code = 'PGTAP-FREE'),
  'redeemed', 'reserva marcada como redeemed');
select is(public.redeem_courtesy_coupon('PGTAP-FREE', 'c1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111'),
  'already_active', 'idempotente no mesmo evento');
select is(public.redeem_courtesy_coupon('PGTAP-FREE', 'c1111111-1111-4111-8111-111111111111', 'e1111112-1111-4111-8111-111111111111'),
  'already_used', 'mesmo usuário não usa 2x');
select is(public.redeem_courtesy_coupon('PGTAP-FREE', 'c2222222-2222-4222-8222-222222222222', 'e2222222-2222-4222-8222-222222222222'),
  'exhausted', 'max_redemptions=1 respeitado');
select is(public.redeem_courtesy_coupon('PGTAP-10', 'c2222222-2222-4222-8222-222222222222', 'e2222222-2222-4222-8222-222222222222'),
  'not_courtesy', 'cupom comum não vira gratuidade');

-- Cupom comum: reserva + uso único
select is((select status from public.reserve_coupon('PGTAP-10', 'c2222222-2222-4222-8222-222222222222', 'e2222222-2222-4222-8222-222222222222')),
  'ok', 'reserva no início do checkout');
select is((select status from public.reserve_coupon('PGTAP-10', 'c2222222-2222-4222-8222-222222222222', 'e2222222-2222-4222-8222-222222222222')),
  'ok', 'retry no mesmo evento reutiliza a reserva');
select is((select count(*)::int from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id
            where c.code = 'PGTAP-10' and r.status = 'reserved'), 1, 'sem reserva duplicada');

-- Reserva abandonada (>15 min, sem pagamento) é liberada e pode ser refeita
update public.coupon_redemptions set created_at = now() - interval '20 minutes'
 where coupon_id = (select id from public.coupons where code = 'PGTAP-10');
select is((select status from public.reserve_coupon('PGTAP-10', 'c2222222-2222-4222-8222-222222222222', 'e1111112-1111-4111-8111-111111111111')),
  'ok', 'reserva abandonada liberada');

-- Cliente não chama as funções nem lê redenções
set local role authenticated;
select throws_ok($$ select public.redeem_courtesy_coupon('PGTAP-FREE', 'c1111111-1111-4111-8111-111111111111', 'e1111112-1111-4111-8111-111111111111') $$,
  '42501', null, 'authenticated não executa redeem_courtesy_coupon');
select throws_ok($$ select * from public.coupon_redemptions $$, '42501', null, 'authenticated não lê coupon_redemptions');
reset role;

select * from finish();
rollback;
