-- 0079 — Cobertura visível ao dono do evento + base das lacunas (aditiva).
--
-- O vínculo DM → evento já existe em supplier_conversations.event_id (mesma chave
-- (channel, external_user_id) de prospect_conversations). Em vez de duplicar o
-- vínculo, a função abaixo faz o join. A cobertura ganha a categoria da cotação
-- (para calcular lacunas por categoria).
--
-- Privacidade: a função NÃO devolve evidência (texto do fornecedor), ids de
-- fornecedor, conversa ou cotação — só um rótulo anônimo "Cotação N".

alter table public.quote_item_coverage
  add column if not exists category text check (category is null or category ~ '^[a-z_]{2,40}$');

comment on column public.quote_item_coverage.category is
  'Categoria do catálogo da cotação (ex.: buffet).';

create or replace function public.event_coverage_summary(p_event_id uuid)
returns table (
  quote_label text,
  category text,
  item_code text,
  coverage text,
  extra_price_cents bigint,
  quantity_covered integer,
  rounds_asked smallint,
  a_confirmar boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    coalesce((select auth.role()) = 'service_role', false)
    or public.is_admin()
    or exists (
      select 1 from public.events e
      where e.id = p_event_id
        and e.user_deleted_at is null
        and (
          e.owner_profile_id = (select auth.uid())
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    )
  ) then
    raise exception 'sem acesso ao evento' using errcode = '42501';
  end if;

  return query
  with quotes as (
    select q.id, dense_rank() over (order by min(c.created_at), q.id) as n
    from public.quote_item_coverage c
    join public.prospect_quotes q on q.id = c.prospect_quote_id
    join public.prospect_conversations pc on pc.id = c.conversation_id
    join public.supplier_conversations sc
      on sc.channel = pc.channel and sc.external_user_id = pc.external_user_id
    where sc.event_id = p_event_id
    group by q.id
  )
  select 'Cotação ' || qs.n::text,
         c.category,
         c.item_code,
         c.coverage,
         c.extra_price_cents,
         c.quantity_covered,
         c.rounds_asked,
         (c.coverage = 'unknown' and c.rounds_asked >= 2)
  from public.quote_item_coverage c
  join quotes qs on qs.id = c.prospect_quote_id
  order by qs.n, c.item_code;
end;
$$;

revoke all on function public.event_coverage_summary(uuid) from public, anon;
grant execute on function public.event_coverage_summary(uuid) to authenticated, service_role;
