-- 0086 — Registro de mídia publicada pelo autopilot (aditiva).
--
-- Garante que o autopilot de marketing nunca repita uma imagem: o FLUX grava
-- o hash SHA-256 do conteúdo (identidade global) e o fallback estático grava a
-- chave `static:<caminho>` para respeitar a janela de reutilização (24h).
--
-- Escrita/leitura apenas por service_role (server actions/workers). RLS fica
-- habilitada e forçada, sem política de leitura: dados operacionais internos.

create table if not exists public.autopilot_media (
  id uuid primary key default gen_random_uuid(),
  media_key text not null,
  kind text not null check (kind in ('post', 'story', 'reel')),
  theme text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists autopilot_media_key_idx
  on public.autopilot_media (media_key);
create index if not exists autopilot_media_recent_idx
  on public.autopilot_media (kind, created_at);

alter table public.autopilot_media enable row level security;
alter table public.autopilot_media force row level security;
