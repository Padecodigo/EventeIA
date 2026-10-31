-- 0063 — Conversas de fornecedor nos canais Meta (Instagram DM + Messenger) — aditiva.
--
-- Modela a conversa aberta pelo FORNECEDOR (nunca abordagem fria) e a janela de
-- resposta da Meta: 24h após a última mensagem (standard_24h) ou 7 dias quando a
-- chegada é via anúncio Click-to-Direct (ad_7d). O `ref` carrega a origem do link
-- ig.me/m.me ou do anúncio. Nada aqui altera nem apaga dados existentes.

create table if not exists public.supplier_conversations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  channel text not null check (channel in ('instagram', 'messenger')),
  -- PSID no Messenger, IGSID no Instagram — identificador do remetente no canal.
  external_user_id text not null,
  ref text,
  last_inbound_at timestamptz,
  window_expires_at timestamptz,
  window_kind text not null default 'standard_24h'
    check (window_kind in ('standard_24h', 'ad_7d')),
  status text not null default 'open'
    check (status in ('open', 'canal_fechado', 'opted_out')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_user_id)
);

create index if not exists supplier_conversations_event_idx
  on public.supplier_conversations (event_id);
create index if not exists supplier_conversations_supplier_idx
  on public.supplier_conversations (supplier_id);
create index if not exists supplier_conversations_window_idx
  on public.supplier_conversations (status, window_expires_at);

create table if not exists public.supplier_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.supplier_conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  body text not null,
  moderated boolean not null default false,
  external_id text,
  created_at timestamptz not null default now()
);

-- Idempotência: o mesmo evento externo (mid do Meta) não entra duas vezes.
create unique index if not exists supplier_conversation_messages_external_uniq
  on public.supplier_conversation_messages (conversation_id, external_id)
  where external_id is not null;

create index if not exists supplier_conversation_messages_conversation_idx
  on public.supplier_conversation_messages (conversation_id, created_at);

-- RLS: escrita apenas service_role (workers/ingestão). Leitura: admin, ou o dono
-- do evento (via join), quando a conversa está ligada a um evento.
alter table public.supplier_conversations enable row level security;
alter table public.supplier_conversations force row level security;

create policy "supplier_conversations: admin lê"
  on public.supplier_conversations for select to authenticated
  using (public.is_admin());

create policy "supplier_conversations: dono do evento lê"
  on public.supplier_conversations for select to authenticated
  using (
    event_id is not null and exists (
      select 1 from public.events e
      where e.id = supplier_conversations.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    )
  );

alter table public.supplier_conversation_messages enable row level security;
alter table public.supplier_conversation_messages force row level security;

create policy "supplier_conversation_messages: admin lê"
  on public.supplier_conversation_messages for select to authenticated
  using (public.is_admin());

create policy "supplier_conversation_messages: dono do evento lê"
  on public.supplier_conversation_messages for select to authenticated
  using (
    exists (
      select 1 from public.supplier_conversations c
      join public.events e on e.id = c.event_id
      where c.id = supplier_conversation_messages.conversation_id
        and c.event_id is not null
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    )
  );
