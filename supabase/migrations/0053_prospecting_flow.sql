-- 0053 — Fluxo de prospecção: posts, conversas, mensagens e cotações (aditiva).
--
-- Tabelas do fluxo "posts de isca -> DM -> cotação". Nada aqui altera nem apaga
-- dados existentes. Escrita apenas por service_role (workers/ingestão); leitura
-- restrita ao admin sob RLS, como em public.suppliers.

create table if not exists public.prospect_posts (
  id uuid primary key default gen_random_uuid(),
  caption text not null check (char_length(caption) between 1 and 2200),
  image_url text,
  categories text[] not null default '{}',
  day_index integer not null default 0 check (day_index >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'published', 'failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  ig_media_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospect_posts_status_idx
  on public.prospect_posts (status, scheduled_at);

create table if not exists public.prospect_conversations (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  channel text not null check (channel in ('instagram', 'messenger')),
  external_user_id text not null,
  status text not null default 'open'
    check (status in ('open', 'awaiting_supplier', 'awaiting_human', 'quoted', 'closed', 'opted_out')),
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_user_id)
);

create index if not exists prospect_conversations_supplier_idx
  on public.prospect_conversations (supplier_id);

create table if not exists public.prospect_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.prospect_conversations (id),
  direction text not null check (direction in ('in', 'out')),
  body text not null,
  external_id text,
  created_at timestamptz not null default now()
);

-- Idempotência: o mesmo evento externo não entra duas vezes na conversa.
create unique index if not exists prospect_messages_external_uniq
  on public.prospect_messages (conversation_id, external_id)
  where external_id is not null;

create index if not exists prospect_messages_conversation_idx
  on public.prospect_messages (conversation_id, created_at);

create table if not exists public.prospect_quotes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.prospect_conversations (id),
  supplier_id uuid not null references public.suppliers (id),
  product text not null check (char_length(product) between 1 and 200),
  specifications text,
  volume integer check (volume is null or volume >= 0),
  moq integer check (moq is null or moq > 0),
  price_cents bigint check (price_cents is null or price_cents >= 0),
  deadline_days integer check (deadline_days is null or deadline_days >= 0),
  shipping_cents bigint check (shipping_cents is null or shipping_cents >= 0),
  payment_terms text,
  valid_until date,
  status text not null default 'draft'
    check (status in ('draft', 'confirmed', 'escalated', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospect_quotes_conversation_idx
  on public.prospect_quotes (conversation_id);

-- RLS: leitura admin; escrita apenas service_role (sem policy de escrita).
alter table public.prospect_posts enable row level security;
alter table public.prospect_posts force row level security;
create policy "prospect_posts: admin lê"
  on public.prospect_posts for select to authenticated
  using (public.is_admin());

alter table public.prospect_conversations enable row level security;
alter table public.prospect_conversations force row level security;
create policy "prospect_conversations: admin lê"
  on public.prospect_conversations for select to authenticated
  using (public.is_admin());

alter table public.prospect_messages enable row level security;
alter table public.prospect_messages force row level security;
create policy "prospect_messages: admin lê"
  on public.prospect_messages for select to authenticated
  using (public.is_admin());

alter table public.prospect_quotes enable row level security;
alter table public.prospect_quotes force row level security;
create policy "prospect_quotes: admin lê"
  on public.prospect_quotes for select to authenticated
  using (public.is_admin());
