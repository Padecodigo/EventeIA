-- 0061 — Saúde diária do token da Meta (aditiva).
--
-- 1) finance_alerts passa a aceitar o tipo 'meta_token' (alerta do token Meta).
-- 2) meta_token_status: histórico do cheque diário do token (válido, expira,
--    escopos concedidos/faltando). Escrita só service_role; leitura só admin.
--
-- Forward-only, aditivo: nada é apagado, nenhum dado é removido.

alter table public.finance_alerts
  drop constraint if exists finance_alerts_kind_check;
alter table public.finance_alerts
  add constraint finance_alerts_kind_check check (
    kind in ('low_balance', 'low_runway', 'fetch_error', 'meta_token')
  );

create table if not exists public.meta_token_status (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  is_valid boolean not null,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  missing_scopes text[] not null default '{}',
  optional_missing text[] not null default '{}',
  error text,
  last_alert_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists meta_token_status_checked_idx
  on public.meta_token_status (checked_at desc);

-- RLS: leitura admin; escrita apenas service_role (sem policy de escrita).
alter table public.meta_token_status enable row level security;
alter table public.meta_token_status force row level security;

create policy "meta_token_status: admin lê"
  on public.meta_token_status for select to authenticated
  using (public.is_admin());
