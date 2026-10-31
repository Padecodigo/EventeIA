-- 0076 — Lixeira do admin vazia de verdade + "Arquivo morto" de custos — aditiva.
--
-- Ao "Esvaziar" (decisão do dono, 31/10/2026):
--   * Fornecedor referenciado por histórico de cliente: PII anonimizada de forma
--     irreversível (anonymized_at), linha e FKs mantidas, sai da lixeira.
--   * Custo (registro fiscal): vai para o arquivo morto (archived_at), oculto da
--     lixeira e das telas; expurgado automaticamente 5 anos depois.
--   * Demais itens sem referência: DELETE definitivo (já existia).

alter table public.suppliers
  add column if not exists anonymized_at timestamptz;
comment on column public.suppliers.anonymized_at is
  'PII removida de forma irreversível ao esvaziar a lixeira (linha mantida pelo histórico de clientes).';

alter table public.cost_entries
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles (id) on delete set null;
comment on column public.cost_entries.archived_at is
  'Arquivo morto fiscal: oculto da lixeira/telas, somente leitura, expurgado após 5 anos.';

create index if not exists cost_entries_archived_idx
  on public.cost_entries (archived_at) where archived_at is not null;
create index if not exists cost_entries_archived_by_idx
  on public.cost_entries (archived_by) where archived_by is not null;
create index if not exists suppliers_anonymized_idx
  on public.suppliers (anonymized_at) where anonymized_at is not null;

-- Arquivo/anonimização: só entram itens que já estão na lixeira e não têm volta.
alter table public.cost_entries
  drop constraint if exists cost_entries_archived_in_trash,
  add constraint cost_entries_archived_in_trash check (archived_at is null or deleted_at is not null);
alter table public.suppliers
  drop constraint if exists suppliers_anonymized_in_trash,
  add constraint suppliers_anonymized_in_trash check (anonymized_at is null or deleted_at is not null);

create or replace function public.guard_cost_archive()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.archived_at is not null then
    raise exception 'custo no arquivo morto é somente leitura' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists cost_entries_archive_guard on public.cost_entries;
create trigger cost_entries_archive_guard before update on public.cost_entries
  for each row execute function public.guard_cost_archive();

create or replace function public.guard_supplier_anonymized()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.anonymized_at is not null and (
       new.anonymized_at is null or new.deleted_at is null
    or new.name is distinct from old.name
    or new.phone_e164 is not null or new.contact_email is not null
    or new.website_url is not null or new.external_id is not null
    or new.source_url is distinct from old.source_url) then
    raise exception 'fornecedor anonimizado não pode ser restaurado nem reidentificado' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists suppliers_anonymized_guard on public.suppliers;
create trigger suppliers_anonymized_guard before update on public.suppliers
  for each row execute function public.guard_supplier_anonymized();

-- Expurgo fiscal: 5 anos após o mais tardio entre a data do custo e o arquivamento.
create or replace function public.purge_expired_cost_archive(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.cost_entries
   where archived_at is not null
     and greatest(occurred_at, archived_at) + interval '5 years' <= p_now;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_expired_cost_archive(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_expired_cost_archive(timestamptz) to service_role;
revoke all on function public.guard_cost_archive() from public, anon, authenticated;
revoke all on function public.guard_supplier_anonymized() from public, anon, authenticated;
