-- 0070 — Detalhes editáveis do evento: local, capacidade e estilo (aditiva).
--
-- O cliente pode ajustar o número de convidados depois de criar o evento e
-- informar a capacidade/tipo do local e o estilo da festa. O agente usa esses
-- dados para alertar quando o local comporta menos convidados do que o evento
-- espera e para orientar a curadoria visual.
--
-- Nada aqui altera ou apaga dados existentes: as colunas nascem nulas.

alter table public.events
  add column if not exists venue_capacity integer,
  add column if not exists venue_type text,
  add column if not exists event_style text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_venue_capacity_check'
  ) then
    alter table public.events
      add constraint events_venue_capacity_check
      check (venue_capacity is null or venue_capacity > 0) not valid;
  end if;
end;
$$;

comment on column public.events.venue_capacity is
  'Capacidade máxima de convidados do local informado pelo cliente.';
comment on column public.events.venue_type is
  'Tipo do local: salao, chacara, sitio, jardim, praia, hotel, clube, outro.';
comment on column public.events.event_style is
  'Estilo da festa: rustico_chique, classico, moderno, boho, praia, industrial, outro.';
