-- 0034: cidades extras de busca de fornecedores — ADITIVA e não destrutiva (expand).
-- Só adiciona uma coluna anulável; null/ausente ⇒ busca apenas na cidade do evento.
-- Guarda SOMENTE códigos IBGE (o servidor resolve nome/UF pela lista estática):
-- sem texto livre ⇒ sem injeção em prompt via esta coluna.
-- CHECK: 1..10 códigos de 7 dígitos (mesmo teto de MAX_SEARCH_CITIES).
-- RLS: as políticas de `events` são por linha; a coluna herda as mesmas regras.
-- Sem função/trigger/view nova ⇒ nenhuma superfície SECURITY DEFINER; sem grants novos.

alter table public.events
  add column if not exists search_city_codes integer[]
    check (
      search_city_codes is null
      or (
        cardinality(search_city_codes) between 1 and 10
        and 1000000 <= all (search_city_codes)
        and 9999999 >= all (search_city_codes)
      )
    );

comment on column public.events.search_city_codes is
  'Códigos IBGE de cidades extras para buscar fornecedores (a cidade do evento é sempre incluída).';
