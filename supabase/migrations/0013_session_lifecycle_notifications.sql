-- 0013 — Ciclo de vida efêmero das sessões WhatsApp + notificações in-app.
-- ADITIVA e não destrutiva (expand): só adiciona colunas/tabela e AMPLIA o
-- check de status (todos os valores antigos continuam válidos).

-- ------------------------------------------------------------
-- whatsapp_instances: connecting | active | draining | disconnected
-- (mantém 'connected' e 'paused' por compatibilidade com o código atual).
-- ------------------------------------------------------------
alter table public.whatsapp_instances
  drop constraint if exists whatsapp_instances_status_check;

alter table public.whatsapp_instances
  add constraint whatsapp_instances_status_check
  check (status in ('connecting', 'connected', 'active', 'draining', 'disconnected', 'paused'));

alter table public.whatsapp_instances
  add column if not exists event_id uuid references public.events (id) on delete set null,
  add column if not exists collection_window_minutes integer
    check (collection_window_minutes is null or collection_window_minutes between 30 and 60),
  add column if not exists activated_at timestamptz,
  add column if not exists drain_at timestamptz,
  add column if not exists disconnected_at timestamptz;

create index if not exists whatsapp_instances_event_idx
  on public.whatsapp_instances (event_id) where event_id is not null;

-- ------------------------------------------------------------
-- notifications: "quotations_ready" (fim da coleta / desconexão segura)
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  type text not null check (type in ('quotations_ready')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  email_sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_idx
  on public.notifications (profile_id, created_at desc);

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists "notifications: dono lê" on public.notifications;
create policy "notifications: dono lê"
  on public.notifications for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "notifications: dono marca lida" on public.notifications;
create policy "notifications: dono marca lida"
  on public.notifications for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- O dono só pode alterar read_at; inserts apenas via service_role (workers).
revoke insert, update, delete on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
