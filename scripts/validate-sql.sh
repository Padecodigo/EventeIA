#!/usr/bin/env bash
# Valida localmente o schema, as políticas RLS e as funções SQL
# usando um Postgres puro (sem Supabase CLI/Docker Compose).
# Uso: bash scripts/validate-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
CONTAINER="EventeIA-sql-check-$$"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "▸ subindo $IMAGE…"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres \
  "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
alter role service_role bypassrls;
SQL

# Todas as migrations, em ordem (glob ordena lexicograficamente: 0001…0013…).
for migration in supabase/migrations/*.sql; do
  echo "▸ aplicando ${migration}…"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration"
done

echo "▸ aplicando seed…"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/seed.sql

echo "▸ smoke test: pagamento → webhook → tíquete ativo → feed"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'alice@teste.com', '{"full_name":"Alice"}');

insert into public.workspaces (id, owner_id, name)
values ('99999999-9999-9999-9999-999999999999',
        '11111111-1111-1111-1111-111111111111', 'Atelier Alice');

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        'Evento teste', 'casamento', '2026-12-01', 'sp', 100);

insert into public.payments
  (id, profile_id, purpose, event_id, asaas_payment_id, billing_type, amount_cents)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
        '11111111-1111-1111-1111-111111111111', 'event_ticket',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pay_123', 'PIX', 4700);

insert into public.event_tickets (event_id, status, payment_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pending',
        'cccccccc-cccc-cccc-cccc-cccccccccccc');

insert into public.webhook_events (id, source, external_event_id, payload)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'asaas', 'evt_1',
        '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_123","status":"RECEIVED"}}');

select public.process_payment_webhook('dddddddd-dddd-dddd-dddd-dddddddddddd') as resultado;
select status as pagamento from public.payments where asaas_payment_id = 'pay_123';
select status as tiquete from public.event_tickets where event_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select count(*) as feeds from public.system_events where type = 'payment.confirmed';

-- idempotência: reprocessar não duplica efeito
select public.process_payment_webhook('dddddddd-dddd-dddd-dddd-dddddddddddd') as reprocessado;
select count(*) as feeds_apos_replay from public.system_events where type = 'payment.confirmed';

-- ledger: franquia + consumo, saldo nunca negativo
insert into public.credit_ledger (workspace_id, entry_type, amount_cents, idempotency_key)
values ('99999999-9999-9999-9999-999999999999', 'grant', 100, 'grant:smoke');

select balance_after_cents as saldo from public.credit_ledger where idempotency_key = 'grant:smoke';

do $$
begin
  begin
    insert into public.credit_ledger (workspace_id, entry_type, amount_cents, idempotency_key)
    values ('99999999-9999-9999-9999-999999999999', 'consume', -200, 'consume:smoke');
    raise notice 'FALHA: consumo acima do saldo deveria ter sido bloqueado';
  exception when others then
    raise notice 'ok: consumo acima do saldo bloqueado (%)', sqlerrm;
  end;
end $$;

-- depoimentos: publicação só aparece para anon após aprovação
insert into public.testimonial_invites (token, event_id, profile_id)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111');

insert into public.testimonials
  (invite_id, profile_id, event_id, author_name, city, event_context, audience,
   quote, outcome, consent_given, consent_text_version, status, published, published_at)
select id, profile_id, event_id, 'Alice Teste', 'Campinas, SP', 'Casamento · 100 convidados',
       'b2c',
       'Depoimento de teste com mais de oitenta caracteres para validar o fluxo completo de coleta, moderação e publicação na vitrine.',
       'Resultado de teste', true, '2026-10-v1', 'pending', false, null
from public.testimonial_invites where token = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

set role anon;
select count(*) as depoimentos_visiveis_antes_de_aprovar from public.testimonials;
reset role;

update public.testimonials
set status = 'approved', published = true, published_at = now()
where author_name = 'Alice Teste';

set role anon;
select count(*) as depoimentos_visiveis_publicados from public.testimonials;
reset role;

-- top-up de créditos: pagamento confirmado concede 3 créditos (+300 centavos)
insert into public.payments
  (id, profile_id, purpose, asaas_payment_id, billing_type, amount_cents, status,
   credits_granted, workspace_id)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff',
        '11111111-1111-1111-1111-111111111111', 'credit_topup', 'pay_topup_1',
        'PIX', 11700, 'pending', 3, '99999999-9999-9999-9999-999999999999');

insert into public.webhook_events (id, source, external_event_id, payload)
values ('12121212-1212-1212-1212-121212121212', 'asaas', 'evt_topup_1',
        '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_topup_1","status":"RECEIVED"}}');

select public.process_payment_webhook('12121212-1212-1212-1212-121212121212') as topup_processado;
select entry_type, amount_cents as creditos_em_centavos
  from public.credit_ledger where idempotency_key = 'topup:pay_topup_1';

-- assinatura: fatura recebida concede a franquia do plano (atelier = 7 créditos)
insert into public.workspaces (id, owner_id, name, plan_code)
values ('88888888-8888-8888-8888-888888888888',
        '11111111-1111-1111-1111-111111111111', 'Ateliê E2E', 'atelier');

insert into public.subscriptions (workspace_id, plan_code, asaas_subscription_id)
values ('88888888-8888-8888-8888-888888888888', 'atelier', 'sub_e2e_1');

insert into public.webhook_events (id, source, external_event_id, payload)
values ('34343434-3434-3434-3434-343434343434', 'asaas', 'evt_sub_1',
        '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_sub_1","status":"RECEIVED","subscription":"sub_e2e_1"}}');

select public.process_payment_webhook('34343434-3434-3434-3434-343434343434') as sub_processado;
select entry_type, amount_cents as franquia
  from public.credit_ledger where idempotency_key = 'grant:sub:sub_e2e_1:pay:pay_sub_1';
select status as assinatura from public.subscriptions where asaas_subscription_id = 'sub_e2e_1';

-- cupom: pagamento confirmado conta a redenção (trigger idempotente por transição -> paid)
insert into public.coupons (code, discount_type, value, active)
values ('SMOKE10', 'percent', 10, true);

insert into public.payments
  (id, profile_id, purpose, asaas_payment_id, billing_type, amount_cents, status,
   coupon_code, discount_cents)
values ('acacacac-acac-acac-acac-acacacacacac',
        '11111111-1111-1111-1111-111111111111', 'event_ticket', 'pay_coupon_1',
        'PIX', 8730, 'pending', 'SMOKE10', 970);

insert into public.webhook_events (id, source, external_event_id, payload)
values ('56565656-5656-5656-5656-565656565656', 'asaas', 'evt_coupon_1',
        '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_coupon_1","status":"RECEIVED"}}');

select public.process_payment_webhook('56565656-5656-5656-5656-565656565656') as coupon_processado;
select redemptions as redencoes from public.coupons where code = 'SMOKE10';
select count(*) as feeds_coupon from public.system_events where type = 'coupon.redeemed';

-- replay: pagamento já paid, redenção não duplica
select public.process_payment_webhook('56565656-5656-5656-5656-565656565656') as coupon_replay;
select redemptions as redencoes_pos_replay from public.coupons where code = 'SMOKE10';

-- 0011/0012: RLS default-deny — sem grants para anon/authenticated
-- (permissão negada ANTES da RLS: códigos de cupom não são enumeráveis)
do $$
declare
  n int;
begin
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('coupons', 'whatsapp_instances', 'vendor_prospects')
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n > 0 then
    raise exception 'default-deny violada: % grants inesperados', n;
  end if;
end $$;

-- políticas RLS presentes
select count(*) as coupons_policies from pg_policies where tablename = 'coupons';
select count(*) as instances_policies from pg_policies where tablename = 'whatsapp_instances';
select count(*) as prospects_policies from pg_policies where tablename = 'vendor_prospects';

-- Agente Orçamentista: registro + opt-out via service role
insert into public.whatsapp_instances (profile_id, instance_name)
values ('11111111-1111-1111-1111-111111111111', 'eventeia-smoke');

insert into public.vendor_prospects (event_id, vendor_name, vendor_category, phone_e164)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fornecedor Teste', 'buffet', '+5512999998888');

update public.vendor_prospects
   set status = 'opt_out', opt_out_at = now()
 where phone_e164 = '+5512999998888';

select status as prospect_pos_optout from public.vendor_prospects
 where phone_e164 = '+5512999998888';

-- credenciais criptografadas: coluna existe e aceita payload opaco
update public.whatsapp_instances
   set credentials_encrypted = 'aGVsbG8='
 where instance_name = 'eventeia-smoke';

select credentials_encrypted is not null as credencial_opaca
  from public.whatsapp_instances where instance_name = 'eventeia-smoke';
SQL

echo "✅ schema, RLS e funções aplicados com sucesso"
