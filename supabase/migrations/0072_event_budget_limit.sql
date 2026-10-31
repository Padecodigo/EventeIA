-- 0072 — Orçamento limite do evento + histórico auditável (aditiva).
--
-- O cliente pode informar (opcional) quanto pretende gastar no evento e editar
-- esse valor depois. Regras:
--   * só o DONO do evento ou um ADMIN altera o limite (planner do workspace não);
--   * toda alteração (inclusive a definição na criação) gera uma linha imutável
--     em event_budget_limit_history, escrita apenas por trigger;
--   * o limite NÃO esconde opções: a interface apenas sinaliza "acima do seu limite".
--
-- Nada aqui altera ou apaga dados existentes: a coluna nasce nula.

alter table public.events
  add column if not exists budget_limit_cents bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_budget_limit_cents_check'
  ) then
    alter table public.events
      add constraint events_budget_limit_cents_check
      check (budget_limit_cents is null or budget_limit_cents between 10000 and 100000000000) not valid;
  end if;
end;
$$;

comment on column public.events.budget_limit_cents is
  'Orçamento limite informado pelo cliente (centavos de BRL, total do evento). Null = sem limite.';

-- ------------------------------------------------------------
-- Histórico (somente leitura para usuários; escrito por trigger)
-- ------------------------------------------------------------
create table if not exists public.event_budget_limit_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  old_cents bigint,
  new_cents bigint,
  changed_by uuid references public.profiles (id) on delete set null,
  source text not null check (source in ('owner', 'admin', 'system')),
  changed_at timestamptz not null default now()
);

create index if not exists event_budget_limit_history_event_idx
  on public.event_budget_limit_history (event_id, changed_at desc);
create index if not exists event_budget_limit_history_changed_by_idx
  on public.event_budget_limit_history (changed_by);

alter table public.event_budget_limit_history enable row level security;
alter table public.event_budget_limit_history force row level security;

drop policy if exists "event_budget_limit_history: dono ou admin lê" on public.event_budget_limit_history;
create policy "event_budget_limit_history: dono ou admin lê"
  on public.event_budget_limit_history for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_budget_limit_history.event_id
        and e.owner_profile_id = (select auth.uid())
    )
  );
-- Sem políticas de INSERT/UPDATE/DELETE: só o trigger (SECURITY DEFINER) escreve.

-- ------------------------------------------------------------
-- Guarda + auditoria
-- ------------------------------------------------------------
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
    v_source := 'system';                     -- service_role / jobs
  elsif v_uid = new.owner_profile_id then
    v_source := 'owner';
  elsif public.is_admin() then
    v_source := 'admin';
  else
    raise exception 'apenas o dono do evento ou um admin pode alterar o orçamento limite'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.status in ('completed', 'canceled') and v_source <> 'system' then
    raise exception 'evento encerrado: orçamento limite não pode ser alterado'
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

revoke all on function public.events_budget_limit_guard() from public, anon, authenticated;

drop trigger if exists events_budget_limit_guard on public.events;
create trigger events_budget_limit_guard
  after insert or update of budget_limit_cents on public.events
  for each row execute function public.events_budget_limit_guard();

-- ------------------------------------------------------------
-- RPC: dono ou admin define o limite (admin não tem UPDATE em events via RLS)
-- ------------------------------------------------------------
create or replace function public.set_event_budget_limit(p_event_id uuid, p_cents bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  select owner_profile_id, status into v_owner, v_status from public.events where id = p_event_id;
  if not found or (v_owner <> auth.uid() and not public.is_admin()) then
    raise exception 'evento não encontrado' using errcode = '42501';
  end if;
  if p_cents is not null and (p_cents < 10000 or p_cents > 100000000000) then
    raise exception 'orçamento limite fora da faixa' using errcode = '22023';
  end if;
  update public.events set budget_limit_cents = p_cents where id = p_event_id;
  return p_cents;
end;
$$;

revoke all on function public.set_event_budget_limit(uuid, bigint) from public, anon;
grant execute on function public.set_event_budget_limit(uuid, bigint) to authenticated;

grant select on public.event_budget_limit_history to authenticated;
revoke insert, update, delete on public.event_budget_limit_history from authenticated;
grant all on public.event_budget_limit_history to service_role;
revoke all on public.event_budget_limit_history from anon;
