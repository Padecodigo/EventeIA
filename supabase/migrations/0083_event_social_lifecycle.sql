-- 0083 — event social lifecycle (reviewed migration package). Forward-only/aditiva.
-- EventeIA event social lifecycle migration (EXTRACTED VERBATIM from docs/proposals/event-social-lifecycle-migration.md, sections 1-3).
-- NOT APPLIED, NOT RUN. For disposable-DB review only. Supabase migrations run in a single transaction: any exception rolls back everything.
-- Order: section 1 additive columns -> section 2 non-destructive duplicate preflight (raises, never deletes) + unique index -> section 3 ref-preserving purge functions.

-- ===== Section 1 =====
alter table public.prospecting_posts
  add column if not exists fb_post_id text;

alter table public.prospect_posts
  add column if not exists fb_post_id text,
  add column if not exists publication jsonb not null default '{}'::jsonb;

-- ===== Section 2 =====
do $$
declare
  r record;
  v_total integer := 0;
begin
  for r in
    select event_id,
           day_index,
           categories[1] as category,
           count(*) as n,
           array_agg(id order by created_at) as ids
      from public.prospect_posts
     where event_id is not null and categories[1] is not null
     group by event_id, day_index, categories[1]
    having count(*) > 1
  loop
    v_total := v_total + r.n;
    raise warning 'reserva duplicada: event_id=% day_index=% category=% n=% ids=%',
      r.event_id, r.day_index, r.category, r.n, r.ids;
  end loop;
  if v_total > 0 then
    raise exception
      'não é possível criar prospect_posts_reservation_uniq: % linha(s) duplicada(s) por (event_id, day_index, categories[1]); resolva manualmente (as linhas podem conter refs remotas)',
      v_total;
  end if;
end $$;

-- Rollout: dentro das migrações Supabase (transação), use CREATE UNIQUE INDEX.
-- Fora de transação, a alternativa é CREATE UNIQUE INDEX CONCURRENTLY.
create unique index if not exists prospect_posts_reservation_uniq
  on public.prospect_posts (event_id, day_index, (categories[1]))
  where event_id is not null;

-- ===== Section 3 =====
create or replace function public.event_publication_has_refs(
  p_ig text,
  p_fb text,
  p_publication jsonb,
  p_error text
) returns boolean
language sql
immutable
as $$
  select
    coalesce(btrim(p_ig), '') <> ''
    or coalesce(btrim(p_fb), '') <> ''
    or coalesce(p_error, '') like 'manual_removal_required:%'
    or exists (
      select 1
      from jsonb_each(coalesce(p_publication, '{}'::jsonb)) as entry(key, value)
      where entry.key in ('instagram', 'facebook')
        and coalesce(entry.value->>'kind', 'pending')
            not in ('pending', 'removed')
    );
$$;

-- 0080, linhas 86-89: não apagar post com ref remota pendente/incerta.
create or replace function public.purge_closed_event_content(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid[];
  v_prospect uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_conv
  from public.supplier_conversations where event_id = p_event_id;

  select coalesce(array_agg(pc.id), '{}') into v_prospect
  from public.prospect_conversations pc
  join public.supplier_conversations sc
    on sc.channel = pc.channel and sc.external_user_id = pc.external_user_id
  where sc.event_id = p_event_id;

  delete from public.supplier_conversation_messages where conversation_id = any (v_conv);
  delete from public.prospect_messages where conversation_id = any (v_prospect);
  update public.quote_item_coverage set evidence = null where conversation_id = any (v_prospect);

  delete from public.event_budget_limit_history where event_id = p_event_id;
  delete from public.notifications where event_id = p_event_id;

  delete from public.prospecting_posts p
   where p.event_id = p_event_id
     and not public.event_publication_has_refs(
       p.ig_media_id, p.fb_post_id, p.image_params->'publication', p.error
     );

  -- Mantém a privacidade original: apaga rascunhos/falhos sem refs,
  -- independentemente de deleted_at; preserva qualquer linha com ref.
  delete from public.prospect_posts p
   where p.event_id = p_event_id
     and not public.event_publication_has_refs(
       p.ig_media_id, p.fb_post_id, p.publication, p.error
     );

  update public.events
     set interview_answers = null,
         content_purged_at = coalesce(content_purged_at, now())
   where id = p_event_id;

  insert into public.event_deletion_audit (event_id, profile_id, action)
  select id, owner_profile_id, 'closed_content_purged' from public.events where id = p_event_id;
end;
$$;

-- 0080, linhas 167-169: idem para a varredura pós-worker.
create or replace function public.purge_closed_event_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.prospect_posts p
   using public.events e
   where e.id = p.event_id and e.closed_at is not null
     and not public.event_publication_has_refs(
       p.ig_media_id, p.fb_post_id, p.publication, p.error
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.event_publication_has_refs(text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.event_publication_has_refs(text, text, jsonb, text)
  to service_role;
