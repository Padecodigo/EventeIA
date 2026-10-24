-- EventeIA — schema inicial (fonte da verdade: .context/DATABASE_RLS.md)
-- Migrações são forward-only: correções sempre em nova migração.

create extension if not exists pgcrypto;

-- ============================================================
-- PLANOS (B2B)
-- ============================================================
create table public.plans (
  code text primary key,
  name text not null,
  price_cents bigint not null check (price_cents > 0),
  monthly_credits integer not null check (monthly_credits > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PERFIS (1:1 com auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'b2c' check (role in ('b2c', 'b2b', 'admin')),
  display_name text not null,
  phone_e164 text,
  document_type text not null default 'cpf' check (document_type in ('cpf', 'cnpj')),
  document_number text,
  asaas_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- WORKSPACES (B2B)
-- ============================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  name text not null,
  plan_code text not null default 'essencial' references public.plans (code),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  member_role text not null check (member_role in ('owner', 'planner', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);

-- ============================================================
-- EVENTOS
-- ============================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles (id),
  workspace_id uuid references public.workspaces (id),
  title text not null,
  event_type text not null,
  event_date date not null,
  region_code text not null,
  guest_count integer not null check (guest_count between 1 and 5000),
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_payment', 'active', 'completed', 'canceled')),
  created_at timestamptz not null default now()
);

create index events_owner_idx on public.events (owner_profile_id, created_at desc);
create index events_workspace_idx on public.events (workspace_id) where workspace_id is not null;

-- ============================================================
-- PAGAMENTOS (Asaas) — criado antes de event_tickets (FK)
-- ============================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  purpose text not null check (purpose in ('event_ticket', 'credit_topup', 'subscription_invoice')),
  event_id uuid references public.events (id),
  asaas_payment_id text not null unique,
  billing_type text not null check (billing_type in ('PIX', 'CREDIT_CARD')),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'confirmed', 'overdue', 'refunded', 'risk_review', 'chargeback')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  refunded_at timestamptz
);

create index payments_profile_idx on public.payments (profile_id, created_at desc);
create index payments_event_idx on public.payments (event_id) where event_id is not null;

-- Tíquete B2C (1 por evento quando comprado)
create table public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events (id),
  status text not null default 'pending' check (status in ('pending', 'active', 'refunded')),
  payment_id uuid references public.payments (id),
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- COTAÇÕES E ORÇAMENTOS
-- ============================================================
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  category text not null,
  vendor_name text not null,
  vendor_contact text,
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'confirmed', 'declined', 'expired')),
  engine_version text not null,
  created_at timestamptz not null default now()
);

create index quotations_event_idx on public.quotations (event_id, created_at desc);

create table public.budget_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  engine_version text not null,
  total_cents bigint not null check (total_cents >= 0),
  breakdown jsonb not null,
  created_at timestamptz not null default now()
);

create index budget_snapshots_event_idx on public.budget_snapshots (event_id, created_at desc);

-- ============================================================
-- ASSINATURAS (Asaas) — pagamentos definidos acima (FK de event_tickets)
-- ============================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  plan_code text not null references public.plans (code),
  asaas_subscription_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'overdue', 'canceled')),
  current_period_start date,
  current_period_end date,
  created_at timestamptz not null default now()
);

-- ============================================================
-- WEBHOOKS (idempotência) — .context/PAYMENTS.md §4
-- ============================================================
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('asaas', 'evolution')),
  external_event_id text not null,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'failed')),
  attempts integer not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  unique (source, external_event_id)
);

create index webhook_events_status_idx on public.webhook_events (status, received_at);

-- ============================================================
-- CRÉDITOS B2B (ledger append-only) — .context/COMMERCIAL_MODEL.md §4
-- ============================================================
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id),
  entry_type text not null check (entry_type in ('grant', 'topup', 'consume', 'refund', 'expire', 'adjust')),
  amount_cents bigint not null,
  balance_after_cents bigint not null,
  expires_at timestamptz,
  source_payment_id uuid references public.payments (id),
  source_subscription_id uuid references public.subscriptions (id),
  event_id uuid references public.events (id),
  idempotency_key text not null unique,
  note text,
  created_at timestamptz not null default now()
);

create index credit_ledger_workspace_idx on public.credit_ledger (workspace_id, created_at desc);

-- ============================================================
-- WHATSAPP — .context/WHATSAPP_EVOLUTION.md §3
-- ============================================================
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id),
  event_id uuid references public.events (id),
  direction text not null check (direction in ('outbound', 'inbound')),
  template text not null,
  to_number_e164 text not null,
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'canceled')),
  idempotency_key text not null unique,
  external_message_id text unique,
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index whatsapp_messages_event_idx on public.whatsapp_messages (event_id, created_at desc);

-- ============================================================
-- CONSENTIMENTOS (LGPD) — .context/WHATSAPP_EVOLUTION.md §5
-- ============================================================
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id),
  phone_e164 text not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  status text not null check (status in ('opted_in', 'opted_out')),
  source text not null default 'form',
  updated_at timestamptz not null default now(),
  unique (phone_e164, channel)
);

-- ============================================================
-- FEEDS (append-only, particionado por mês) — .context/FEEDS.md
-- ============================================================
create table public.system_events (
  id uuid not null default gen_random_uuid(),
  type text not null,
  occurred_at timestamptz not null,
  actor_type text not null check (actor_type in ('user', 'system', 'webhook', 'admin')),
  actor_id uuid,
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  source text not null check (source in ('app', 'worker', 'webhook')),
  schema_version integer not null default 1,
  primary key (id, occurred_at)
) partition by range (occurred_at);

create table public.system_events_default partition of public.system_events default;

create index system_events_type_time_idx on public.system_events (type, occurred_at desc);
create index system_events_aggregate_idx on public.system_events (aggregate_type, aggregate_id);
create index system_events_correlation_idx on public.system_events (correlation_id);

-- ============================================================
-- GRANTS (RLS decide de fato o que cada papel enxerga)
-- ============================================================
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema public to anon;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
