-- 0074 — Ajuste da trava de edição (0073) conforme o dono (31/10/2026 15:04).
--
-- Dados do evento E a data de início da busca ficam editáveis ATÉ o instante
-- agendado do início da busca (09:00 de Brasília do search_start_date, abertura
-- da janela comercial, espelhando lib/business-days DISCOVERY_WINDOW). Travam a
-- partir desse instante, ou antes, se a busca já começou (discovery_started_at),
-- e também com o evento encerrado. Concluir a entrevista NÃO trava mais.
-- O orçamento limite é editável SEMPRE, inclusive com o evento encerrado
-- (só 'canceled' continua bloqueado). Aditiva/forward-only; não altera dados.

create or replace function public.event_search_start_at(p_search_start_date date)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case when p_search_start_date is null then null
    else (p_search_start_date + time '09:00') at time zone 'America/Sao_Paulo' end;
$$;

create or replace function public.event_edit_locked(
  p_status text,
  p_discovery_started_at timestamptz,
  p_search_start_date date,
  p_now timestamptz default now()
)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_status = 'completed'
      or (p_status = 'active'
          and (p_discovery_started_at is not null
               or (p_search_start_date is not null
                   and p_now >= public.event_search_start_at(p_search_start_date))));
$$;

comment on function public.event_edit_locked(text, timestamptz, date, timestamptz) is
  'Trava de edição do cliente (0074): busca iniciada ou instante agendado atingido, ou encerrado. Espelhado em lib/events/edit-lock.ts.';

create or replace function public.guard_events_started_lock()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if not public.event_edit_locked(old.status, old.discovery_started_at, old.search_start_date) then
    return new;
  end if;
  if (to_jsonb(new) - array['status', 'budget_limit_cents'])
     is distinct from (to_jsonb(old) - array['status', 'budget_limit_cents']) then
    raise exception 'busca iniciada: só o orçamento limite pode ser alterado'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_event_requirements_started_lock()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_id uuid := coalesce(new.event_id, old.event_id);
  v_locked boolean;
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return coalesce(new, old);
  end if;
  select public.event_edit_locked(e.status, e.discovery_started_at, e.search_start_date)
    into v_locked
    from public.events e
   where e.id = v_event_id;
  if coalesce(v_locked, false) then
    raise exception 'busca iniciada: a entrevista não pode mais ser alterada'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

-- Orçamento limite: editável sempre (inclusive encerrado); só excluído bloqueia.
create or replace function public.events_budget_limit_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_source text;
begin
  if tg_op = 'UPDATE' and new.budget_limit_cents is not distinct from old.budget_limit_cents then
    return new;
  end if;
  if tg_op = 'INSERT' and new.budget_limit_cents is null then
    return new;
  end if;

  if v_uid is null then
    v_source := 'system';
  elsif v_uid = new.owner_profile_id then
    v_source := 'owner';
  elsif public.is_admin() then
    v_source := 'admin';
  else
    raise exception 'apenas o dono do evento ou um admin pode alterar o orçamento limite'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.status = 'canceled' and v_source <> 'system' then
    raise exception 'evento excluído: orçamento limite não pode ser alterado'
      using errcode = '42501';
  end if;

  insert into public.event_budget_limit_history (event_id, old_cents, new_cents, changed_by, source)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.budget_limit_cents else null end,
    new.budget_limit_cents,
    v_uid,
    v_source
  );
  return new;
end;
$$;

drop function if exists public.event_is_started(text, timestamptz, timestamptz);

revoke all on function public.guard_events_started_lock() from public, anon, authenticated;
revoke all on function public.guard_event_requirements_started_lock() from public, anon, authenticated;
revoke all on function public.events_budget_limit_guard() from public, anon, authenticated;
