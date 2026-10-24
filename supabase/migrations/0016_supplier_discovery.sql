-- 0016: descoberta automática de fornecedores — aditiva.
-- Cache global de fornecedores (reutilizado entre eventos/cidades), origem dos prospects,
-- janela de coleta (5 cotações/categoria ou 48h) e auditoria de chamadas a provedores.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  category text not null,
  phone_e164 text unique check (phone_e164 is null or phone_e164 ~ '^\+55\d{10,11}$'),
  whatsapp_verified boolean,
  website_url text,
  source_url text not null,
  source_provider text not null,
  external_id text,
  city text,
  region_code text,
  opt_out_at timestamptz,
  last_contacted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists suppliers_city_category_idx on public.suppliers (lower(city), category);
create unique index if not exists suppliers_provider_external_idx
  on public.suppliers (source_provider, external_id) where external_id is not null;

alter table public.suppliers enable row level security;
alter table public.suppliers force row level security;

-- Somente admin lê; escrita apenas service_role (workers / ingestão interna).
create policy "suppliers: admin lê"
  on public.suppliers for select to authenticated
  using (public.is_admin());

alter table public.vendor_prospects
  add column if not exists supplier_id uuid references public.suppliers (id),
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'auto', 'ingest')),
  add column if not exists source_url text,
  add column if not exists dry_run boolean not null default false;

create unique index if not exists vendor_prospects_event_phone_uniq
  on public.vendor_prospects (event_id, phone_e164);

alter table public.events
  add column if not exists discovery_started_at timestamptz,
  add column if not exists discovery_ends_at timestamptz,
  add column if not exists discovery_status text
    check (discovery_status is null or discovery_status in ('running', 'completed', 'paused'));

alter table public.whatsapp_instances
  add column if not exists number_mode text
    check (number_mode is null or number_mode in ('dedicated', 'personal'));

create table if not exists public.supplier_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  provider text not null,
  category text not null,
  round integer not null default 0,
  found integer not null default 0,
  inserted integer not null default 0,
  enqueued integer not null default 0,
  status text not null check (status in ('ok', 'error', 'skipped')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists supplier_discovery_runs_event_idx
  on public.supplier_discovery_runs (event_id, created_at desc);

alter table public.supplier_discovery_runs enable row level security;
alter table public.supplier_discovery_runs force row level security;

create policy "discovery runs: leitura via evento"
  on public.supplier_discovery_runs for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = supplier_discovery_runs.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    )
  );
