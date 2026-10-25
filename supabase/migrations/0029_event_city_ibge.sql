-- 0029: município do evento (IBGE) — ADITIVA e não destrutiva (expand).
-- Só adiciona colunas anuláveis; `city` (0015) e `region_code` (0001) seguem como estão.
-- Eventos antigos ficam com city_uf/city_ibge_code nulos e continuam válidos.
-- RLS: as políticas de `events` são por linha; colunas novas herdam as mesmas regras.
-- Sem função/trigger nova ⇒ nenhuma superfície SECURITY DEFINER.

alter table public.events
  add column if not exists city_uf char(2)
    check (city_uf is null or city_uf ~ '^[A-Z]{2}$'),
  add column if not exists city_ibge_code integer
    check (city_ibge_code is null or city_ibge_code between 1000000 and 9999999);

comment on column public.events.city_uf is 'UF do município do evento (IBGE).';
comment on column public.events.city_ibge_code is 'Código IBGE (7 dígitos) do município do evento.';
