-- 0074 — Exclusão do histórico de eventos pelo usuário (LGPD art. 18, VI) — aditiva.
--
-- Fluxo:
--   1) Soft delete: o DONO pede a exclusão de eventos ENCERRADOS (completed/canceled).
--      O evento some de todas as telas do usuário/planner (RLS) e pode ser
--      desfeito por 30 dias.
--   2) Expurgo: um job (service_role) chama purge_user_deleted_events() e, após a
--      carência, apaga o conteúdo do usuário e anonimiza a linha do evento.
--
-- Mantidos (art. 16 LGPD / regra existente): dados de fornecedor (suppliers,
-- supplier_options, supplier_conversations*, quotations, vendor_prospects),
-- registros financeiros (payments, event_tickets, credit_ledger, cupons,
-- cost_entries) e prova de consentimento (contact_handoff_consents).
-- A linha de events NÃO é apagada (vira "lápide" anonimizada) para não quebrar
-- as FKs financeiras nem o cascade de contact_handoff_consents.

alter table public.events
  add column if not exists user_deleted_at timestamptz,
  add column if not exists user_deleted_by uuid references public.profiles (id) on delete set null,
  add column if not exists user_purged_at timestamptz;

comment on column public.events.user_deleted_at is
  'Exclusão pedida pelo usuário (soft delete). Expurgo após 30 dias. Null = visível.';
comment on column public.events.user_purged_at is
  'Conteúdo do usuário expurgado (evento anonimizado; dados de fornecedor/financeiros mantidos).';

create index if not exists events_user_deleted_idx
  on public.events (user_deleted_at)
  where user_deleted_at is not null and user_purged_at is null;
create index if not exists events_user_deleted_by_idx on public.events (user_deleted_by);

-- ------------------------------------------------------------
-- RLS: eventos apagados somem para dono e workspace (admin segue via 0035).
-- ------------------------------------------------------------
drop policy if exists "events: dono lê" on public.events;
create policy "events: dono lê"
  on public.events for select to authenticated
  using (owner_profile_id = (select auth.uid()) and user_deleted_at is null);

drop policy if exists "events: membros do workspace leem" on public.events;
create policy "events: membros do workspace leem"
  on public.events for select to authenticated
  using (
    user_deleted_at is null
    and workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "events: dono/planner edita" on public.events;
create policy "events: dono/planner edita"
  on public.events for update to authenticated
  using (
    user_deleted_at is null
    and (
      owner_profile_id = (select auth.uid())
      or (workspace_id is not null and public.can_edit_workspace(workspace_id))
    )
  )
  with check (
    user_deleted_at is null
    and (
      owner_profile_id = (select auth.uid())
      or (workspace_id is not null and public.can_edit_workspace(workspace_id))
    )
  );

-- ------------------------------------------------------------
-- Auditoria (sem conteúdo apagado)
-- ------------------------------------------------------------
create table if not exists public.event_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('requested', 'undone', 'purged')),
  created_at timestamptz not null default now()
);
create index if not exists event_deletion_audit_event_idx
  on public.event_deletion_audit (event_id, created_at desc);
create index if not exists event_deletion_audit_profile_idx
  on public.event_deletion_audit (profile_id);

alter table public.event_deletion_audit enable row level security;
alter table public.event_deletion_audit force row level security;

drop policy if exists "event_deletion_audit: admin ou próprio lê" on public.event_deletion_audit;
create policy "event_deletion_audit: admin ou próprio lê"
  on public.event_deletion_audit for select to authenticated
  using (public.is_admin() or profile_id = (select auth.uid()));

grant select on public.event_deletion_audit to authenticated;
revoke insert, update, delete on public.event_deletion_audit from authenticated;
grant all on public.event_deletion_audit to service_role;
revoke all on public.event_deletion_audit from anon;

-- ------------------------------------------------------------
-- RPCs do dono
-- ------------------------------------------------------------
-- p_event_ids null = todo o histórico elegível do usuário. Retorna quantos foram marcados.
create or replace function public.request_event_history_deletion(p_event_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;

  if p_event_ids is not null and exists (
    select 1 from public.events e
    where e.id = any (p_event_ids)
      and (e.owner_profile_id <> v_uid or e.status not in ('completed', 'canceled'))
  ) then
    raise exception 'só eventos encerrados do próprio usuário podem ser apagados'
      using errcode = '42501';
  end if;

  with marked as (
    update public.events e
       set user_deleted_at = now(), user_deleted_by = v_uid
     where e.owner_profile_id = v_uid
       and e.status in ('completed', 'canceled')
       and e.user_deleted_at is null
       and (p_event_ids is null or e.id = any (p_event_ids))
    returning e.id
  ), audit as (
    insert into public.event_deletion_audit (event_id, profile_id, action)
    select id, v_uid, 'requested' from marked
    returning 1
  )
  select count(*)::integer into v_count from audit;

  return v_count;
end;
$$;

create or replace function public.undo_event_history_deletion(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  update public.events
     set user_deleted_at = null, user_deleted_by = null
   where id = p_event_id
     and owner_profile_id = v_uid
     and user_deleted_at is not null
     and user_purged_at is null
     and user_deleted_at > now() - interval '30 days';
  if not found then
    raise exception 'não é mais possível desfazer esta exclusão' using errcode = '42501';
  end if;
  insert into public.event_deletion_audit (event_id, profile_id, action)
  values (p_event_id, v_uid, 'undone');
  return true;
end;
$$;

-- Lista os eventos do próprio usuário na carência (para o "Desfazer").
create or replace function public.list_my_deleted_events()
returns table (id uuid, title text, event_date date, user_deleted_at timestamptz, purge_after timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.event_date, e.user_deleted_at, e.user_deleted_at + interval '30 days'
  from public.events e
  where e.owner_profile_id = auth.uid()
    and e.user_deleted_at is not null
    and e.user_purged_at is null
  order by e.user_deleted_at desc;
$$;

-- ------------------------------------------------------------
-- Expurgo (somente service_role / job)
-- ------------------------------------------------------------
create or replace function public.purge_user_deleted_events(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
  from public.events
  where user_deleted_at is not null
    and user_purged_at is null
    and user_deleted_at <= p_now - interval '30 days';

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  -- Conteúdo do usuário
  delete from public.event_requirements where event_id = any (v_ids);
  delete from public.budget_snapshots where event_id = any (v_ids);
  delete from public.quotation_choices where event_id = any (v_ids);
  delete from public.supplier_selections where event_id = any (v_ids);
  delete from public.notifications where event_id = any (v_ids);
  delete from public.testimonial_invites where event_id = any (v_ids);

  -- Anonimiza o evento (auth.uid() null → trigger do 0072 registra como 'system')
  update public.events
     set title = 'Evento removido',
         interview_answers = null,
         venue_capacity = null,
         venue_type = null,
         event_style = null,
         search_city_codes = null,
         budget_limit_cents = null,
         user_purged_at = p_now
   where id = any (v_ids);

  delete from public.event_budget_limit_history where event_id = any (v_ids);

  insert into public.event_deletion_audit (event_id, profile_id, action)
  select id, user_deleted_by, 'purged' from public.events where id = any (v_ids);

  return cardinality(v_ids);
end;
$$;

revoke all on function public.request_event_history_deletion(uuid[]) from public, anon;
revoke all on function public.undo_event_history_deletion(uuid) from public, anon;
revoke all on function public.list_my_deleted_events() from public, anon;
grant execute on function public.request_event_history_deletion(uuid[]) to authenticated;
grant execute on function public.undo_event_history_deletion(uuid) to authenticated;
grant execute on function public.list_my_deleted_events() to authenticated;

revoke all on function public.purge_user_deleted_events(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_user_deleted_events(timestamptz) to service_role;
