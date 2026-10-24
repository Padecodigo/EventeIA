-- pgTAP: financeiro ADMIN (0020) — só admin lê/escreve custos, preços, câmbio e todos os pagamentos.
begin;
create extension if not exists pgtap;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now());
update public.profiles set role = 'admin' where id = 'a1111111-1111-4111-8111-111111111111';

insert into public.cost_entries (provider, reason, cost_micro_usd, fx_brl_per_usd_micro, cost_brl_cents)
values ('search', 'discovery', 750, 5600000, 1);
insert into public.payments (profile_id, purpose, asaas_payment_id, billing_type, amount_cents, status, asaas_fee_cents, net_cents)
values ('b2222222-2222-4222-8222-222222222222', 'event_ticket', 'pay_fin_test', 'PIX', 4990, 'confirmed', 199, 4791);

select throws_ok($$ insert into public.cost_entries (provider, reason, cost_micro_usd, fx_brl_per_usd_micro, cost_brl_cents) values ('openai', 'x1', 1, 1, 0) $$,
  '23514', null, 'Provedor desconhecido é rejeitado');

-- Cliente comum
select set_config('request.jwt.claims', json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.cost_entries), 0::bigint, 'Não-admin não lê custos');
select is((select count(*) from public.pricing_rates), 0::bigint, 'Não-admin não lê preços');
select throws_ok($$ insert into public.fx_rates (rate_date, brl_per_usd_micro) values ('2026-10-24', 5600000) $$, '42501', null, 'Não-admin não grava câmbio');
select throws_ok($$ insert into public.cost_entries (provider, reason, cost_micro_usd, fx_brl_per_usd_micro, cost_brl_cents) values ('vps', 'fixed_monthly', 1, 1, 0) $$, '42501', null, 'Não-admin não grava custo');
select is((select count(*) from public.payments), 1::bigint, 'Cliente vê só o próprio pagamento');
reset role;

-- Admin
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.cost_entries), 1::bigint, 'Admin lê custos');
select lives_ok($$ insert into public.cost_entries (provider, kind, reason, cost_micro_usd, fx_brl_per_usd_micro, cost_brl_cents) values ('vps', 'fixed', 'fixed_monthly', 6000000, 5600000, 3360) $$, 'Admin lança custo fixo');
select is((select count(*) from public.payments where asaas_payment_id = 'pay_fin_test'), 1::bigint, 'Admin lê pagamentos de todos');
delete from public.cost_entries;
select is((select count(*) from public.cost_entries), 2::bigint, 'Ninguém apaga custos (sem política de DELETE)');
reset role;

select * from finish();
rollback;
