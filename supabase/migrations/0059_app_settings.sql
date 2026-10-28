-- 0059 — Configurações do produto (chave/valor) — aditiva.
--
-- Guarda flags operacionais (ex.: autopilot de publicidade). Leitura/escrita
-- restritas ao admin; o servidor usa service_role.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
alter table public.app_settings force row level security;

create policy "app_settings: admin lê" on public.app_settings
  for select to authenticated using (public.is_admin());
create policy "app_settings: admin escreve" on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
