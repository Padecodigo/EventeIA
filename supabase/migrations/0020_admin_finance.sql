-- 0020: painel financeiro ADMIN (aditiva). Custos (USD/BRL com câmbio gravado), preços,
-- câmbio, custos fixos e taxas Asaas. Leitura/escrita SOMENTE para admin (is_admin()).

-- 1) Reaproveita llm_usage_events: contexto de cobrança + tokens de cache + pico.
alter table public.llm_usage_events
  add column if not exists event_id uuid references public.events (id),
  add column if not exists profile_id uuid references public.profiles (id),
  add column if not exists reason text check (reason is null or char_length(reason) between 2 and 40),
  add column if not exists model text check (model is null or char_length(model) <= 80),
  add column if not exists cache_hit_tokens integer not null default 0 check (cache_hit_tokens >= 0),
  add column if not exists peak boolean,
  add column if not exists fx_brl_per_usd_micro bigint check (fx_brl_per_usd_micro is null or fx_brl_per_usd_micro > 0),
  add column if not exists cost_brl_cents bigint check (cost_brl_cents is null or cost_brl_cents >= 0);

create index if not exists llm_usage_events_event_idx on public.llm_usage_events (event_id) where event_id is not null;
create index if not exists llm_usage_events_created_idx on public.llm_usage_events (created_at desc);

-- 2) Demais custos: search/fetch/whatsapp/xai-search e custos fixos manuais.
create table if not exists public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  provider text not null check (provider in ('deepseek', 'xai', 'nim', 'search', 'fetch', 'whatsapp', 'asaas', 'vps', 'supabase', 'domain', 'other')),
  kind text not null default 'variable' check (kind in ('variable', 'fixed')),
  reason text not null check (char_length(reason) between 2 and 40),
  event_id uuid references public.events (id),
  workspace_id uuid references public.workspaces (id),
  profile_id uuid references public.profiles (id),
  quantity integer not null default 1 check (quantity >= 0),
  unit_price_micro_usd bigint not null default 0 check (unit_price_micro_usd >= 0),
  cost_micro_usd bigint not null check (cost_micro_usd >= 0),
  fx_brl_per_usd_micro bigint not null check (fx_brl_per_usd_micro > 0),
  cost_brl_cents bigint not null check (cost_brl_cents >= 0),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists cost_entries_occurred_idx on public.cost_entries (occurred_at desc);
create index if not exists cost_entries_event_idx on public.cost_entries (event_id) where event_id is not null;

-- 3) Tabela de preços editável pelo admin (sobrepõe env). micro-USD por unidade.
create table if not exists public.pricing_rates (
  key text primary key check (key ~ '^[a-z0-9_.]{3,60}$'),
  micro_usd bigint not null check (micro_usd >= 0),
  unit text not null check (unit in ('per_1m_tokens', 'per_1k_requests', 'per_unit')),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- 4) Câmbio BRL por USD (micro-BRL por 1 USD), um por dia.
create table if not exists public.fx_rates (
  rate_date date primary key,
  brl_per_usd_micro bigint not null check (brl_per_usd_micro > 0),
  source text not null default 'manual' check (char_length(source) between 2 and 40),
  created_at timestamptz not null default now()
);

-- 5) Receita: taxa e líquido do Asaas no pagamento.
alter table public.payments
  add column if not exists asaas_fee_cents bigint check (asaas_fee_cents is null or asaas_fee_cents >= 0),
  add column if not exists net_cents bigint check (net_cents is null or net_cents >= 0);

-- RLS: default-deny + somente admin. Sem DELETE (nunca apagar dados).
alter table public.cost_entries enable row level security;
alter table public.cost_entries force row level security;
alter table public.pricing_rates enable row level security;
alter table public.pricing_rates force row level security;
alter table public.fx_rates enable row level security;
alter table public.fx_rates force row level security;

drop policy if exists "cost_entries_admin_read" on public.cost_entries;
create policy "cost_entries_admin_read" on public.cost_entries for select to authenticated using (public.is_admin());
drop policy if exists "cost_entries_admin_insert" on public.cost_entries;
create policy "cost_entries_admin_insert" on public.cost_entries for insert to authenticated with check (public.is_admin());

drop policy if exists "pricing_rates_admin_read" on public.pricing_rates;
create policy "pricing_rates_admin_read" on public.pricing_rates for select to authenticated using (public.is_admin());
drop policy if exists "pricing_rates_admin_insert" on public.pricing_rates;
create policy "pricing_rates_admin_insert" on public.pricing_rates for insert to authenticated with check (public.is_admin());
drop policy if exists "pricing_rates_admin_update" on public.pricing_rates;
create policy "pricing_rates_admin_update" on public.pricing_rates for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "fx_rates_admin_read" on public.fx_rates;
create policy "fx_rates_admin_read" on public.fx_rates for select to authenticated using (public.is_admin());
drop policy if exists "fx_rates_admin_insert" on public.fx_rates;
create policy "fx_rates_admin_insert" on public.fx_rates for insert to authenticated with check (public.is_admin());
drop policy if exists "fx_rates_admin_update" on public.fx_rates;
create policy "fx_rates_admin_update" on public.fx_rates for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin precisa ler TODOS os pagamentos para o relatório (dono continua lendo os seus).
drop policy if exists "payments: admin lê" on public.payments;
create policy "payments: admin lê" on public.payments for select to authenticated using (public.is_admin());

revoke all on public.cost_entries, public.pricing_rates, public.fx_rates from anon;
grant select, insert on public.cost_entries to authenticated;
grant select, insert, update on public.pricing_rates, public.fx_rates to authenticated;
