-- 0057 — Eventos de analytics do site — aditiva.
--
-- Registra visualizações de página, logins e cadastros para o painel de métricas.
-- Leitura restrita ao admin (RLS); escrita apenas service_role (API/actions).

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event text not null check (event in ('page_view', 'login', 'signup')),
  path text check (path is null or char_length(path) <= 300),
  profile_id uuid,
  session_id text check (session_id is null or char_length(session_id) <= 64),
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_idx on public.analytics_events (created_at);
create index if not exists analytics_events_event_created_idx on public.analytics_events (event, created_at);

alter table public.analytics_events enable row level security;
alter table public.analytics_events force row level security;

create policy "analytics_events: admin lê"
  on public.analytics_events for select to authenticated
  using (public.is_admin());
