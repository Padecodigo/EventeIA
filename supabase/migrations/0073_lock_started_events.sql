-- 0073 — Evento iniciado fica travado para edição do cliente (aditiva, forward-only).
--
-- Regra do dono (31/10/2026): depois que o evento começou (status 'active' com
-- entrevista concluída ou busca iniciada, ou já 'completed'), o cliente NÃO
-- pode mais editar o evento — entrevista/respostas, data, convidados, cidade,
-- local, estilo etc. Só o ORÇAMENTO LIMITE (budget_limit_cents, 0072) continua
-- editável. Bug que motivou: entrevista de evento ativo editada pelo dono.
--
-- Exceções: admin (is_admin()), service_role/postgres (jobs e webhooks do
-- servidor, que gravam discovery_status etc.) e funções SECURITY DEFINER.
-- Continuam permitidos ao cliente: transições de status de 0051
-- (active -> completed, -> canceled) e search_start_date enquanto a busca
-- não começou (agendamento, guardado por 0040).

create or replace function public.event_is_started(
  p_status text,
  p_discovery_started_at timestamptz,
  p_interview_completed_at timestamptz
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_status = 'completed'
      or (p_status = 'active'
          and (p_discovery_started_at is not null or p_interview_completed_at is not null));
$$;

comment on function public.event_is_started(text, timestamptz, timestamptz) is
  'Evento iniciado (0073): active com entrevista concluída/busca iniciada, ou completed. Espelhado em lib/events/edit-lock.ts.';

create or replace function public.guard_events_started_lock()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allowed text[] := array['status', 'budget_limit_cents'];
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if not public.event_is_started(old.status, old.discovery_started_at, old.interview_completed_at) then
    return new;
  end if;
  if old.discovery_started_at is null then
    v_allowed := v_allowed || 'search_start_date';
  end if;
  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'evento iniciado: só o orçamento limite pode ser alterado'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists events_started_lock on public.events;
create trigger events_started_lock
  before update on public.events
  for each row execute function public.guard_events_started_lock();

-- Entrevista = event_requirements: travada junto com o evento.
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
  select public.event_is_started(e.status, e.discovery_started_at, e.interview_completed_at)
    into v_locked
    from public.events e
   where e.id = v_event_id;
  if coalesce(v_locked, false) then
    raise exception 'evento iniciado: a entrevista não pode mais ser alterada'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists event_requirements_started_lock on public.event_requirements;
create trigger event_requirements_started_lock
  before insert or update or delete on public.event_requirements
  for each row execute function public.guard_event_requirements_started_lock();

revoke all on function public.guard_events_started_lock() from public, anon, authenticated;
revoke all on function public.guard_event_requirements_started_lock() from public, anon, authenticated;
