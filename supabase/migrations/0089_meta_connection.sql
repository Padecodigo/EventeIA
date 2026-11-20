-- 0089: conexão Meta (Facebook Login for Business) — single global row.
-- Forward-only, additive. Guarda os tokens do usuário e da Página escolhida
-- (sempre criptografados AES-256-GCM). RLS habilitada SEM policies: só service_role.

create table if not exists public.meta_connections (
  slot text primary key default 'primary' check (slot = 'primary'),
  connected_by uuid references public.profiles(id) on delete set null,
  fb_user_id text not null,
  fb_user_name text,
  -- Tokens criptografados (AES-256-GCM); nunca em claro.
  user_access_token text not null,
  user_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  page_id text,
  page_name text,
  page_picture_url text,
  page_access_token text,
  ig_user_id text,
  ig_username text,
  encrypted boolean not null default true check (encrypted),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meta_connections enable row level security;
alter table public.meta_connections force row level security;
-- Nenhuma policy: acesso apenas por service_role (deny-all intencional).
