-- 0084 — Tokens OAuth do TikTok (Login Kit + Content Posting API).
--
-- Contas TikTok conectadas por um admin. Publicação em rascunho (inbox) apenas:
-- o app inicia o upload (draft) e um humano revisa/publica — nunca publish direto.
--
-- access_token/refresh_token ficam criptografados em repouso (AES-256-GCM,
-- chave server-only TIKTOK_TOKEN_ENCRYPTION_KEY). Sem a chave, os tokens são
-- gravados em claro e `encrypted` fica false (degradação explícita; nunca falha o app).
--
-- Forward-only, aditivo: nada é apagado, nenhuma migração anterior é alterada.

create table if not exists public.tiktok_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id),
  environment text not null default 'sandbox'
    constraint tiktok_oauth_tokens_environment_check
      check (environment in ('sandbox', 'production')),
  open_id text not null,
  display_name text,
  avatar_url text,
  access_token text not null,
  refresh_token text not null,
  encrypted boolean not null default false,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_profile_id, environment)
);

create index if not exists tiktok_oauth_tokens_owner_idx
  on public.tiktok_oauth_tokens (owner_profile_id);

-- RLS: somente service_role lê/escreve. Nenhuma policy permissiva para usuários.
alter table public.tiktok_oauth_tokens enable row level security;
alter table public.tiktok_oauth_tokens force row level security;
