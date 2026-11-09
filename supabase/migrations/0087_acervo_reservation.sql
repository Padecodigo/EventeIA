-- 0087 — Reserva durável do acervo geral (event_id nulo). Aditiva.
-- O índice de evento (0083) ignora event_id nulo. Aqui, uma linha por
-- (day_index, primeira categoria) quando não há evento. Sem apagar nada:
-- se já houver duplicata, o índice não é criado e a publicação segue.

do $$
declare
  v_dup integer;
begin
  select count(*) into v_dup
    from (
      select day_index, categories[1]
        from public.prospect_posts
       where event_id is null and categories[1] is not null
       group by day_index, categories[1]
      having count(*) > 1
    ) d;

  if v_dup > 0 then
    raise warning
      'prospect_posts_acervo_reservation_uniq não criado: % grupo(s) duplicado(s) no acervo',
      v_dup;
  else
    execute
      'create unique index if not exists prospect_posts_acervo_reservation_uniq
         on public.prospect_posts (day_index, (categories[1]))
       where event_id is null';
  end if;
end $$;
