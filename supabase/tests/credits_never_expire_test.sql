-- pgTAP: créditos nunca expiram (0034).
begin;
create extension if not exists pgtap;
select plan(3);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('34111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'noexp@teste.com', 'x', now(),
   '{}'::jsonb, '{"full_name":"NoExp"}'::jsonb, now(), now());

insert into public.workspaces (id, owner_id, name, plan_code)
values ('34aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '34111111-1111-1111-1111-111111111111', 'WS noexp', 'essencial');

insert into public.credit_ledger (workspace_id, entry_type, amount_cents, balance_after_cents, expires_at, idempotency_key, note)
values ('34aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'grant', 500, 0, now() + interval '2 months', 'noexp:grant:1', 'franquia mensal');

select is((select expires_at from public.credit_ledger where idempotency_key = 'noexp:grant:1'), null, 'franquia gravada sem expiração');
select is((select sum(amount_cents)::int from public.credit_ledger where workspace_id = '34aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 500, 'saldo preservado');
select throws_ok(
  $$insert into public.credit_ledger (workspace_id, entry_type, amount_cents, balance_after_cents, idempotency_key)
    values ('34aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expire', -500, 0, 'noexp:expire:1')$$,
  'P0001', null, 'lançamento expire recusado');

select * from finish();
rollback;
