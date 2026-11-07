# Proposta — lifecycle social de eventos (NÃO APLICADA)

> **Status: proposta, NÃO executada.** Não fica em `supabase/migrations/`.
> O código atual falha fechado para os fluxos que dependem destas colunas e
> **não é production-ready** até a migração ser revisada e aplicada.

## 1. Colunas aditivas

```sql
alter table public.prospecting_posts
  add column if not exists fb_post_id text;

alter table public.prospect_posts
  add column if not exists fb_post_id text,
  add column if not exists publication jsonb not null default '{}'::jsonb;
```

`prospect_posts.publication` guarda estado por canal com `kind` literal:
`pending | in_flight | published | failed | manual_removal | uncertain | removed`.
Em `prospecting_posts`, o mesmo estado continua em
`image_params->'publication'` (coluna já existente). Só `removed`/`pending` não
são refs remotas.

## 2. Preflight NÃO destrutivo da reserva única

`reserve()` seleciona por `(event_id, day_index, categories[1])` sem filtrar
status. O índice abaixo usa exatamente a mesma chave. A pré-checagem apenas
diagnostica duplicatas; **nunca apaga/deduplica**.

```sql
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
```

Não há exclusão de status `failed` no índice: `reserve()` também não filtra
status e reusa linhas `failed`/`uncertain` existentes. O client trata `23505`
re-selecionando a linha vencedora.

## 3. Substituir as duas funções que hoje apagam linhas com refs remotas

```sql
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
```

## 4. pgTAP de regressão (NÃO EXECUTADO)

Os fixtures seguem o schema real: `auth.users` → `profiles` → 3 eventos distintos
(status `active`, depois `UPDATE ... SET status='completed'` para disparar
`events_on_closed`/`after_event_closed`). Não há contagem de testes executados.

```sql
begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a0900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-social@teste.com',
   '', now(), '{}'::jsonb,
   '{"full_name":"Dono Social"}'::jsonb, now(), now());

insert into public.events
  (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, status)
values
  ('a0901111-0000-4000-8000-000000000001', 'a0900000-0000-4000-8000-000000000001',
   'IG no JSON', 'casamento', '2026-11-01', 'SP', 10, 'active'),
  ('a0901111-0000-4000-8000-000000000002', 'a0900000-0000-4000-8000-000000000001',
   'FB na coluna', 'casamento', '2026-11-02', 'SP', 10, 'active'),
  ('a0901111-0000-4000-8000-000000000003', 'a0900000-0000-4000-8000-000000000001',
   'Manual removido', 'casamento', '2026-11-03', 'SP', 10, 'active');

insert into public.prospecting_posts
  (event_id, event_code, event_type, event_date, caption, image_url, status,
   ig_media_id, fb_post_id, error, image_params)
values
  ('a0901111-0000-4000-8000-000000000001', 'EVT-SOCIAL1', 'casamento', '2026-11-01',
   'teste', null, 'failed', null, null, null,
   '{"publication":{"instagram":{"kind":"published","id":"123"},"facebook":{"kind":"pending"}}}'::jsonb),
  ('a0901111-0000-4000-8000-000000000002', 'EVT-SOCIAL2', 'casamento', '2026-11-02',
   'teste', null, 'failed', null, 'page_9', null,
   '{"publication":{"instagram":{"kind":"pending"},"facebook":{"kind":"published","id":"page_9"}}}'::jsonb),
  ('a0901111-0000-4000-8000-000000000003', 'EVT-SOCIAL3', 'casamento', '2026-11-03',
   'teste', null, 'failed', null, null,
   'manual_removal_required:https://instagram.com/p/legacy',
   '{"publication":{"instagram":{"kind":"removed"},"facebook":{"kind":"removed"}}}'::jsonb);

insert into public.prospect_posts
  (id, event_id, caption, categories, day_index, status, ig_media_id, fb_post_id, publication)
values
  ('a0902222-0000-4000-8000-000000000001', 'a0901111-0000-4000-8000-000000000001',
   'isca uncertain', '{buffet}', 0, 'failed', null, null,
   '{"instagram":{"kind":"uncertain","reason":"timeout"},"facebook":{"kind":"pending"}}'::jsonb),
  ('a0902222-0000-4000-8000-000000000002', 'a0901111-0000-4000-8000-000000000002',
   'isca sem ref', '{buffet}', 1, 'failed', null, null,
   '{"instagram":{"kind":"removed"},"facebook":{"kind":"removed"}}'::jsonb);

-- Dispara o trigger real de encerramento.
update public.events
   set status = 'completed'
 where id in (
   'a0901111-0000-4000-8000-000000000001',
   'a0901111-0000-4000-8000-000000000002',
   'a0901111-0000-4000-8000-000000000003'
 );

select is((select count(*)::int from public.prospecting_posts where event_code = 'EVT-SOCIAL1'), 1, 'IG no JSON preservado');
select is((select count(*)::int from public.prospecting_posts where event_code = 'EVT-SOCIAL2'), 1, 'FB na coluna preservado');
select is((select count(*)::int from public.prospecting_posts where event_code = 'EVT-SOCIAL3'), 1, 'marcador manual legado preservado');
select is((select count(*)::int from public.prospect_posts where id = 'a0902222-0000-4000-8000-000000000001'), 1, 'isca uncertain preservada');
select is((select count(*)::int from public.prospect_posts where id = 'a0902222-0000-4000-8000-000000000002'), 0, 'isca sem refs sai');
select is((
  select count(*)::int from public.events
   where id in (
     'a0901111-0000-4000-8000-000000000001',
     'a0901111-0000-4000-8000-000000000002',
     'a0901111-0000-4000-8000-000000000003'
   )
     and closed_at is not null
), 3, 'trigger de encerramento rodou nos 3 fixtures');
select is(public.event_publication_has_refs(null, null, '{"instagram":{"kind":"uncertain","reason":"x"}}'::jsonb, null), true, 'uncertain é ref');
select is(public.event_publication_has_refs(null, null, '{"instagram":{"kind":"removed"},"facebook":{"kind":"pending"}}'::jsonb, 'manual_removal_required:https://x'), true, 'marker legado é ref');

select * from finish();
rollback;
```
