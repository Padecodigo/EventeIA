-- 0082 — Confirmação/publicação do evento por código via DM no Instagram (@eventeia).
-- Aditiva: novas colunas + função + trigger. Nenhum dado é apagado.
--
-- confirmation_code: 'EVT-' + 6 chars de um alfabeto sem ambíguos (sem 0/1/I/L/O/U),
--   gerado com gen_random_bytes (CSPRNG) — ~7,3e8 combinações, não derivável do id.
-- confirmed_at: quando o contratante enviou o código por DM. Sem ele o evento não é
--   publicado e a descoberta/prospecção não roda (gate no servidor).

alter table public.events
  add column if not exists confirmation_code text,
  add column if not exists confirmed_at timestamptz;

create or replace function public.generate_event_confirmation_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea;
  code text;
  i int;
begin
  loop
    bytes := extensions.gen_random_bytes(6);
    code := 'EVT-';
    for i in 0..5 loop
      code := code || substr(alphabet, (get_byte(bytes, i) % 30) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.events e where e.confirmation_code = code);
  end loop;
  return code;
end;
$$;

-- SECURITY DEFINER para a checagem de unicidade enxergar todos os eventos (além da RLS).
-- Executável por authenticated porque o trigger de INSERT roda como o cliente; só devolve
-- um código NÃO usado, então não vaza nenhum código existente.
revoke all on function public.generate_event_confirmation_code() from public, anon;
grant execute on function public.generate_event_confirmation_code() to authenticated, service_role;

-- Backfill: todo evento ganha um código.
update public.events
   set confirmation_code = public.generate_event_confirmation_code()
 where confirmation_code is null;

-- Grandfather: eventos que já saíram do rascunho (ativos, concluídos, cancelados…)
-- contam como confirmados — nada que já estava ativo deixa de funcionar.
update public.events
   set confirmed_at = coalesce(discovery_started_at, created_at)
 where confirmed_at is null
   and status not in ('draft', 'awaiting_payment');

create unique index if not exists events_confirmation_code_key
  on public.events (upper(confirmation_code));

alter table public.events
  alter column confirmation_code set not null;

-- Código e confirmação são do servidor: o cliente (anon/authenticated) não define nem
-- altera. No INSERT o código é sempre gerado aqui (qualquer caminho de criação).
create or replace function public.guard_event_confirmation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      new.confirmed_at := null;
      new.confirmation_code := null;
    end if;
    if new.confirmation_code is null then
      new.confirmation_code := public.generate_event_confirmation_code();
    end if;
    return new;
  end if;

  if current_user in ('authenticated', 'anon')
     and (new.confirmation_code is distinct from old.confirmation_code
          or new.confirmed_at is distinct from old.confirmed_at) then
    raise exception 'confirmação do evento é definida pelo servidor' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists events_guard_confirmation on public.events;
create trigger events_guard_confirmation
  before insert or update on public.events
  for each row execute function public.guard_event_confirmation();

comment on column public.events.confirmation_code is
  'Código que o contratante envia por DM ao @eventeia para confirmar e publicar o evento.';
comment on column public.events.confirmed_at is
  'Confirmado (código recebido por DM). Sem isso o evento não é publicado nem prospecta.';
