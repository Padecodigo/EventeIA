-- 0066 — Post de prospecção por evento (aditiva).
--
-- Cada evento pode ter um post de prospecção com a identidade da EventeIA
-- (imagem por tipo de evento, data, cidade/região e código público do evento).
-- O post NUNCA carrega PII do cliente: legenda e parâmetros de imagem são
-- montados apenas com dados públicos do evento.
--
-- Fluxo: admin gera/aprova → publicação pelo Instagram (lib/meta/publishing) →
-- DMs recebidas vinculam-se ao evento por ref, palavra-chave ou código do
-- evento. Escrita apenas por service_role (server actions/workers); leitura
-- restrita ao admin, como nas demais tabelas de prospecção.
--
-- Forward-only, aditiva: não altera nem remove dados existentes.

create table if not exists public.prospecting_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  event_code text not null unique,
  event_type text not null,
  event_date date not null,
  city text,
  region text,
  caption text not null check (char_length(caption) between 1 and 2200),
  image_url text,
  image_params jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'published', 'failed')),
  ig_media_id text,
  error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Um post de prospecção ativo por evento; regenerar usa upsert.
  unique (event_id)
);

create index if not exists prospecting_posts_status_idx
  on public.prospecting_posts (status);
create index if not exists prospecting_posts_event_code_idx
  on public.prospecting_posts (event_code);

alter table public.prospecting_posts enable row level security;
alter table public.prospecting_posts force row level security;

create policy "prospecting_posts: admin lê"
  on public.prospecting_posts for select to authenticated
  using (public.is_admin());
