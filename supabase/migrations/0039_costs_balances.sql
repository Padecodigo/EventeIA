-- 0039: painel de custos/saúde financeira (aditiva, nada é apagado).
-- 1) cost_entries aceita os novos provedores medidos (Serper, Google Places, Resend, Evolution).
-- 2) Admin pode CORRIGIR custos fixos (kind = 'fixed'); variáveis seguem imutáveis. Sem DELETE.
-- 3) provider_balances: saldo/limite por provedor (API ou manual) + limiar de alerta.
-- 4) finance_alerts: histórico dos alertas (dedupe do e-mail diário). Escrita só service_role.

alter table public.cost_entries drop constraint if exists cost_entries_provider_check;
alter table public.cost_entries
  add constraint cost_entries_provider_check check (
    provider in ('deepseek', 'xai', 'nim', 'search', 'fetch', 'whatsapp', 'asaas', 'vps', 'supabase', 'domain', 'other',
                 'serper', 'google_places', 'resend', 'evolution')
  );

create index if not exists cost_entries_provider_occurred_idx on public.cost_entries (provider, occurred_at desc);
create index if not exists cost_entries_created_by_idx on public.cost_entries (created_by) where created_by is not null;
create index if not exists cost_entries_profile_idx on public.cost_entries (profile_id) where profile_id is not null;
create index if not exists cost_entries_workspace_idx on public.cost_entries (workspace_id) where workspace_id is not null;

drop policy if exists "cost_entries_admin_update_fixed" on public.cost_entries;
create policy "cost_entries_admin_update_fixed" on public.cost_entries
  for update to authenticated
  using ((select public.is_admin()) and kind = 'fixed')
  with check ((select public.is_admin()) and kind = 'fixed');
grant update (occurred_at, provider, quantity, unit_price_micro_usd, cost_micro_usd, fx_brl_per_usd_micro, cost_brl_cents, note)
  on public.cost_entries to authenticated;

create table if not exists public.provider_balances (
  provider text primary key check (provider ~ '^[a-z0-9_]{2,40}$'),
  label text not null check (char_length(label) between 2 and 60),
  source text not null default 'manual' check (source in ('api', 'manual', 'budget')),
  -- Saldo atual em centavos de BRL (convertido com o câmbio vigente quando a API devolve USD).
  balance_brl_cents bigint check (balance_brl_cents is null or balance_brl_cents >= -100000000),
  -- Moeda/valor brutos da API (auditoria).
  raw_currency text check (raw_currency is null or char_length(raw_currency) <= 10),
  raw_balance numeric(18, 4),
  -- Orçamento mensal (provedores sem API de saldo, ex.: Google Places): saldo = orçamento − gasto do mês.
  monthly_budget_brl_cents bigint check (monthly_budget_brl_cents is null or monthly_budget_brl_cents >= 0),
  threshold_brl_cents bigint not null default 5000 check (threshold_brl_cents >= 0),
  runway_alert_days integer not null default 7 check (runway_alert_days between 1 and 90),
  daily_burn_brl_cents bigint check (daily_burn_brl_cents is null or daily_burn_brl_cents >= 0),
  fetched_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  last_alert_at timestamptz,
  note text check (note is null or char_length(note) <= 300),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create index if not exists provider_balances_updated_by_idx on public.provider_balances (updated_by) where updated_by is not null;

create table if not exists public.finance_alerts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(provider) between 2 and 40),
  kind text not null check (kind in ('low_balance', 'low_runway', 'fetch_error')),
  balance_brl_cents bigint,
  runway_days numeric(10, 2),
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists finance_alerts_created_idx on public.finance_alerts (created_at desc);

alter table public.provider_balances enable row level security;
alter table public.provider_balances force row level security;
alter table public.finance_alerts enable row level security;
alter table public.finance_alerts force row level security;

drop policy if exists "provider_balances_admin_read" on public.provider_balances;
create policy "provider_balances_admin_read" on public.provider_balances for select to authenticated using ((select public.is_admin()));
drop policy if exists "provider_balances_admin_insert" on public.provider_balances;
create policy "provider_balances_admin_insert" on public.provider_balances for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "provider_balances_admin_update" on public.provider_balances;
create policy "provider_balances_admin_update" on public.provider_balances for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "finance_alerts_admin_read" on public.finance_alerts;
create policy "finance_alerts_admin_read" on public.finance_alerts for select to authenticated using ((select public.is_admin()));

revoke all on public.provider_balances, public.finance_alerts from anon, authenticated;
grant select, insert, update on public.provider_balances to authenticated;
grant select on public.finance_alerts to authenticated;
grant all on public.provider_balances, public.finance_alerts to service_role;

-- Provedores conhecidos (limiar padrão R$ 50; admin ajusta no painel).
insert into public.provider_balances (provider, label, source) values
  ('deepseek', 'DeepSeek', 'api'),
  ('asaas', 'Asaas (saldo da conta)', 'api'),
  ('serper', 'Serper', 'api'),
  ('google_places', 'Google Places (orçamento mensal)', 'budget'),
  ('resend', 'Resend', 'manual'),
  ('vps', 'VPS', 'manual'),
  ('supabase', 'Supabase', 'manual'),
  ('domain', 'Domínio', 'manual')
on conflict (provider) do nothing;
