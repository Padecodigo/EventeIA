-- 0040 — Data agendada para o início da busca de fornecedores (aditiva).
--
-- events.search_start_date: dia (fuso de Brasília) escolhido pelo cliente para
-- começar a descoberta/contato. NULL = "o quanto antes (próximo dia útil)".
-- O worker de descoberta adia o job até a janela comercial desse dia.
--
-- Segurança: as políticas RLS existentes de events (0002) já limitam a escrita
-- ao dono/planner. Este trigger adicional impede que o cliente (authenticated/anon)
-- altere a data depois que a busca começou, agende no passado, na data do evento
-- ou depois dela, em fim de semana ou em feriado nacional
-- (validado também na aplicação).
-- service_role (workers) e funções security definer seguem livres.
-- Não altera nem apaga dados existentes.

alter table public.events
  add column if not exists search_start_date date;

comment on column public.events.search_start_date is
  'Dia (America/Sao_Paulo) agendado pelo cliente para iniciar a busca de fornecedores; NULL = próximo dia útil.';

-- Páscoa (algoritmo de Meeus/Butcher) e feriados nacionais — espelha lib/business-days.ts.
create or replace function public.br_easter_sunday(y integer)
returns date
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  a int := y % 19; b int := y / 100; c int := y % 100; d int := b / 4; e int := b % 4;
  f int := (b + 8) / 25; g int := (b - f + 1) / 3; h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4; k int := c % 4; l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
  mon int := (h + l - 7 * m + 114) / 31; dy int := ((h + l - 7 * m + 114) % 31) + 1;
begin
  return make_date(y, mon, dy);
end;
$$;

create or replace function public.is_br_business_day(d date)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  easter date := public.br_easter_sunday(extract(year from d)::int);
  md text := to_char(d, 'MM-DD');
begin
  if extract(isodow from d) in (6, 7) then return false; end if;
  if md in ('01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25') then return false; end if;
  if d in (easter - 48, easter - 47, easter - 2, easter + 60) then return false; end if;
  return true;
end;
$$;

create or replace function public.guard_events_search_start_date()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  sp_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.search_start_date is not distinct from old.search_start_date then
    return new;
  end if;

  if tg_op = 'UPDATE' and (old.discovery_started_at is not null or old.quotes_delivered_at is not null) then
    raise exception 'a busca já começou; a data não pode mais ser alterada' using errcode = '42501';
  end if;

  if new.search_start_date is not null then
    if new.search_start_date < sp_today then
      raise exception 'data de início da busca no passado' using errcode = '22023';
    end if;
    if new.event_date is not null and new.search_start_date >= new.event_date then
      raise exception 'a busca precisa começar antes do evento' using errcode = '22023';
    end if;
    if not public.is_br_business_day(new.search_start_date) then
      raise exception 'a busca só começa em dia útil (sem fins de semana e feriados nacionais)' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_events_search_start_date() from public, anon, authenticated;

drop trigger if exists events_guard_search_start_date on public.events;
create trigger events_guard_search_start_date
  before insert or update of search_start_date on public.events
  for each row execute function public.guard_events_search_start_date();
