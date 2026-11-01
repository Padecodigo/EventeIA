-- 0080 — P2: encerramento automático + exclusão do conteúdo ao encerrar (aditiva).
--
-- Decisão do usuário (2026-11-01):
--  * Encerra sozinho quando TODA categoria selecionada tem fornecedor escolhido
--    que respondeu (supplier_selections.status = 'respondido'). "Encerrar" manual
--    continua valendo. Ambos passam pelo mesmo gatilho (status → completed).
--  * Ao encerrar, apaga: mensagens/chat, respostas da entrevista, histórico e posts
--    (posts publicados: a mídia sai no Instagram pelo worker, depois a linha).
--  * Mantém relatório (budget_snapshots + escolhas/handoff) no histórico do
--    usuário até 72h DEPOIS da data do evento; então apaga e anonimiza.
--  * Mantidos sempre: dados de fornecedor (suppliers, supplier_conversations,
--    quotations, prospect_quotes/cobertura sem evidência), custos (regra do
--    arquivo morto, 0076), pagamentos/créditos e prova de consentimento.

alter table public.events
  add column if not exists closed_at timestamptz,
  add column if not exists close_reason text check (close_reason is null or close_reason in ('auto', 'manual')),
  add column if not exists content_purged_at timestamptz,
  add column if not exists report_purged_at timestamptz;

create index if not exists events_report_purge_idx
  on public.events (event_date)
  where closed_at is not null and report_purged_at is null;

alter table public.event_deletion_audit drop constraint if exists event_deletion_audit_action_check;
alter table public.event_deletion_audit add constraint event_deletion_audit_action_check
  check (action in ('requested', 'undone', 'purged', 'closed_content_purged', 'closed_report_purged'));

-- Pronto para encerrar: ≥1 categoria selecionada e todas com escolha respondida.
create or replace function public.event_ready_to_close(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with cats as (
    select distinct r.category
    from public.event_requirements r
    where r.event_id = p_event_id and r.selected
  )
  select exists (select 1 from cats)
     and not exists (
       select 1 from cats c
       where not exists (
         select 1
         from public.supplier_selections s
         join public.suppliers sp on sp.id = s.supplier_id
         where s.event_id = p_event_id
           and s.status = 'respondido'
           and sp.category = c.category
       )
     );
$$;

-- Apaga o conteúdo do evento encerrado (idempotente).
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

  -- Mensagens e chat (a conversa do fornecedor fica: é dado de fornecedor).
  delete from public.supplier_conversation_messages where conversation_id = any (v_conv);
  delete from public.prospect_messages where conversation_id = any (v_prospect);
  update public.quote_item_coverage set evidence = null where conversation_id = any (v_prospect);

  -- Histórico do evento.
  delete from public.event_budget_limit_history where event_id = p_event_id;
  delete from public.notifications where event_id = p_event_id;

  -- Posts: rascunhos/não publicados saem já; publicados esperam o worker apagar a mídia.
  delete from public.prospecting_posts
   where event_id = p_event_id and (status <> 'published' or ig_media_id is null);
  delete from public.prospect_posts
   where event_id = p_event_id and (status <> 'published' or ig_media_id is null or deleted_at is not null);

  update public.events
     set interview_answers = null,
         content_purged_at = coalesce(content_purged_at, now())
   where id = p_event_id;

  insert into public.event_deletion_audit (event_id, profile_id, action)
  select id, owner_profile_id, 'closed_content_purged' from public.events where id = p_event_id;
end;
$$;

-- Gatilho único para encerramento manual e automático.
create or replace function public.on_event_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.closed_at is null then
    new.closed_at := now();
    new.close_reason := coalesce(new.close_reason, 'manual');
  end if;
  return new;
end;
$$;

create or replace function public.after_event_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.purge_closed_event_content(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists events_on_closed on public.events;
create trigger events_on_closed before update of status on public.events
  for each row execute function public.on_event_closed();
drop trigger if exists events_after_closed on public.events;
create trigger events_after_closed after update of status on public.events
  for each row execute function public.after_event_closed();

-- Varredura (worker): encerra eventos ativos prontos. Retorna os ids.
create or replace function public.auto_close_ready_events()
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.events e
     set status = 'completed', close_reason = 'auto'
   where e.status = 'active'
     and e.user_deleted_at is null
     and public.event_ready_to_close(e.id)
  returning e.id;
end;
$$;

-- Após o worker apagar a mídia no Instagram: remove as linhas restantes de posts
-- de eventos encerrados. Retorna quantas linhas saíram.
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
     and (p.deleted_at is not null or p.status <> 'published' or p.ig_media_id is null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Relatório + handoff: até 72h depois do fim do dia do evento (BRT).
create or replace function public.purge_closed_event_reports(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
  from public.events
  where closed_at is not null
    and report_purged_at is null
    and ((event_date + 1)::timestamp at time zone 'America/Sao_Paulo') + interval '72 hours' <= p_now;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  delete from public.budget_snapshots where event_id = any (v_ids);
  delete from public.quotation_choices where event_id = any (v_ids);
  delete from public.supplier_selections where event_id = any (v_ids);
  delete from public.event_requirements where event_id = any (v_ids);

  update public.events
     set title = 'Evento removido',
         interview_answers = null,
         venue_capacity = null,
         venue_type = null,
         event_style = null,
         search_city_codes = null,
         budget_limit_cents = null,
         report_purged_at = p_now
   where id = any (v_ids);
  delete from public.event_budget_limit_history where event_id = any (v_ids);

  insert into public.event_deletion_audit (event_id, profile_id, action)
  select id, owner_profile_id, 'closed_report_purged' from public.events where id = any (v_ids);

  return cardinality(v_ids);
end;
$$;

revoke all on function public.event_ready_to_close(uuid) from public, anon, authenticated;
revoke all on function public.purge_closed_event_content(uuid) from public, anon, authenticated;
revoke all on function public.auto_close_ready_events() from public, anon, authenticated;
revoke all on function public.purge_closed_event_reports(timestamptz) from public, anon, authenticated;
revoke all on function public.purge_closed_event_posts() from public, anon, authenticated;
grant execute on function public.purge_closed_event_posts() to service_role;
revoke all on function public.on_event_closed() from public, anon, authenticated;
revoke all on function public.after_event_closed() from public, anon, authenticated;
grant execute on function public.event_ready_to_close(uuid) to service_role;
grant execute on function public.purge_closed_event_content(uuid) to service_role;
grant execute on function public.auto_close_ready_events() to service_role;
grant execute on function public.purge_closed_event_reports(timestamptz) to service_role;
