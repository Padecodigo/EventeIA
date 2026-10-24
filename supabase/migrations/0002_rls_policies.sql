-- EventeIA — RLS default-deny (fonte da verdade: .context/DATABASE_RLS.md)
-- Toda tabela: ENABLE + FORCE; sem política = sem acesso.

-- ============================================================
-- HELPERS (security definer, search_path fixo)
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.profile_id = auth.uid()
  );
$$;

create or replace function public.can_edit_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.profile_id = auth.uid()
      and m.member_role in ('owner', 'planner')
  );
$$;

-- ============================================================
-- HABILITAR RLS EM TUDO (default deny)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.events enable row level security;
alter table public.event_tickets enable row level security;
alter table public.payments enable row level security;
alter table public.quotations enable row level security;
alter table public.budget_snapshots enable row level security;
alter table public.subscriptions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.consents enable row level security;
alter table public.system_events enable row level security;

alter table public.profiles force row level security;
alter table public.plans force row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members force row level security;
alter table public.events force row level security;
alter table public.event_tickets force row level security;
alter table public.payments force row level security;
alter table public.quotations force row level security;
alter table public.budget_snapshots force row level security;
alter table public.subscriptions force row level security;
alter table public.webhook_events force row level security;
alter table public.credit_ledger force row level security;
alter table public.whatsapp_messages force row level security;
alter table public.consents force row level security;
alter table public.system_events force row level security;

-- ============================================================
-- PERFIS
-- ============================================================
create policy "profiles: leitura do próprio"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles: leitura admin"
  on public.profiles for select to authenticated
  using (public.is_admin());

create policy "profiles: criação do próprio"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "profiles: atualização do próprio"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Apenas colunas editáveis; role/documento/asaas são service_role.
revoke update on public.profiles from authenticated;
grant update (display_name, phone_e164) on public.profiles to authenticated;

-- ============================================================
-- PLANOS (catálogo)
-- ============================================================
create policy "plans: leitura autenticada"
  on public.plans for select to authenticated
  using (active = true);

-- ============================================================
-- WORKSPACES
-- ============================================================
create policy "workspaces: membros leem"
  on public.workspaces for select to authenticated
  using (public.is_workspace_member(id) or owner_id = auth.uid());

create policy "workspaces: owner cria"
  on public.workspaces for insert to authenticated
  with check (owner_id = auth.uid());

create policy "workspaces: owner atualiza"
  on public.workspaces for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- MEMBROS DO WORKSPACE
-- ============================================================
create policy "members: membros leem"
  on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "members: owner/planner gerem"
  on public.workspace_members for insert to authenticated
  with check (public.can_edit_workspace(workspace_id));

create policy "members: owner/planner removem"
  on public.workspace_members for delete to authenticated
  using (public.can_edit_workspace(workspace_id) and profile_id <> auth.uid());

-- ============================================================
-- EVENTOS
-- ============================================================
create policy "events: dono lê"
  on public.events for select to authenticated
  using (owner_profile_id = auth.uid());

create policy "events: membros do workspace leem"
  on public.events for select to authenticated
  using (workspace_id is not null and public.is_workspace_member(workspace_id));

create policy "events: dono cria"
  on public.events for insert to authenticated
  with check (
    owner_profile_id = auth.uid()
    and (workspace_id is null or public.can_edit_workspace(workspace_id))
  );

create policy "events: dono/planner edita"
  on public.events for update to authenticated
  using (
    owner_profile_id = auth.uid()
    or (workspace_id is not null and public.can_edit_workspace(workspace_id))
  )
  with check (
    owner_profile_id = auth.uid()
    or (workspace_id is not null and public.can_edit_workspace(workspace_id))
  );

-- ============================================================
-- PAGAMENTOS / TÍQUETES
-- ============================================================
create policy "payments: dono lê"
  on public.payments for select to authenticated
  using (profile_id = auth.uid());

create policy "payments: dono registra cobrança"
  on public.payments for insert to authenticated
  with check (
    profile_id = auth.uid()
    and (
      event_id is null
      or exists (
        select 1 from public.events e
        where e.id = event_id and e.owner_profile_id = auth.uid()
      )
    )
  );

create policy "tickets: leitura via evento"
  on public.event_tickets for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_tickets.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    )
  );

create policy "tickets: dono/planner registra"
  on public.event_tickets for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id))
        )
    )
  );

create policy "tickets: dono/planner atualiza"
  on public.event_tickets for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_tickets.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id))
        )
    )
  );

-- ============================================================
-- COTAÇÕES / SNAPSHOTS
-- ============================================================
create policy "quotations: acesso via evento"
  on public.quotations for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = quotations.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    )
  );

create policy "quotations: escrita via evento editável"
  on public.quotations for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id))
        )
    )
  );

create policy "snapshots: leitura via evento"
  on public.budget_snapshots for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = budget_snapshots.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    )
  );

-- ============================================================
-- ASSINATURAS / LEDGER / WHATSAPP / CONSENTIMENTOS
-- ============================================================
create policy "subscriptions: membros leem"
  on public.subscriptions for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "ledger: membros leem"
  on public.credit_ledger for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "whatsapp: leitura via evento"
  on public.whatsapp_messages for select to authenticated
  using (
    (event_id is not null and exists (
      select 1 from public.events e
      where e.id = whatsapp_messages.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    ))
    or (workspace_id is not null and public.is_workspace_member(workspace_id))
  );

create policy "consents: leitura própria"
  on public.consents for select to authenticated
  using (profile_id = auth.uid());

-- ============================================================
-- FEEDS (somente admin lê; escrita é service_role)
-- ============================================================
create policy "system_events: admin lê"
  on public.system_events for select to authenticated
  using (public.is_admin());

-- webhook_events: sem políticas → somente service_role.
