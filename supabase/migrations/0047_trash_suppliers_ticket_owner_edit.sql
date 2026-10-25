-- 0047: lixeira de fornecedores, log de auditoria do admin e edição/exclusão do próprio chamado.
-- ADITIVA: só colunas, tabelas, índices, funções e políticas novas. Nada existente é removido/reescrito.

-- 1) Fornecedores: exclusão recuperável (aparece na Lixeira; restaurar = deleted_at null).
alter table public.suppliers add column if not exists deleted_at timestamptz;
alter table public.suppliers add column if not exists deleted_by uuid references public.profiles (id) on delete set null;
create index if not exists suppliers_deleted_by_idx on public.suppliers (deleted_by) where deleted_by is not null;
create index if not exists suppliers_deleted_at_idx on public.suppliers (deleted_at desc) where deleted_at is not null;

-- 2) Log de auditoria das ações sensíveis do admin (ex.: exclusão definitiva). Só admin lê; grava o servidor.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_table text not null check (char_length(target_table) between 1 and 80),
  target_ids uuid[] not null default '{}',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_admin_idx on public.admin_audit_log (admin_id) where admin_id is not null;
alter table public.admin_audit_log enable row level security;
alter table public.admin_audit_log force row level security;
create policy "admin_audit_log: admin lê"
  on public.admin_audit_log for select to authenticated
  using (public.is_admin());
grant select on public.admin_audit_log to authenticated;

-- 3) Chamados: o dono edita (assunto/descrição, só enquanto aberto) e exclui (soft delete) os próprios.
alter table public.support_tickets add column if not exists edited_at timestamptz;

create table if not exists public.support_ticket_edits (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  edited_by uuid references public.profiles (id) on delete set null,
  old_subject text not null,
  old_message text not null,
  edited_at timestamptz not null default now()
);
create index if not exists support_ticket_edits_ticket_idx on public.support_ticket_edits (ticket_id, edited_at);
create index if not exists support_ticket_edits_editor_idx on public.support_ticket_edits (edited_by) where edited_by is not null;
alter table public.support_ticket_edits enable row level security;
alter table public.support_ticket_edits force row level security;
create policy "support_ticket_edits: admin lê"
  on public.support_ticket_edits for select to authenticated
  using (public.is_admin());
grant select on public.support_ticket_edits to authenticated;

-- Dono não vê os próprios chamados excluídos (admin continua vendo; restritiva = soma às existentes).
create policy "support_tickets: oculta excluídos do dono"
  on public.support_tickets as restrictive for select to authenticated
  using (deleted_at is null or public.is_admin());

-- Edição: só o dono (auth.uid()), chamado não excluído e em aberto/em andamento. Guarda o texto anterior.
create or replace function public.support_ticket_owner_edit(p_ticket_id uuid, p_subject text, p_message text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 3 and 140
     or char_length(btrim(coalesce(p_message, ''))) not between 10 and 5000 then
    raise exception 'invalid_args' using errcode = '22023';
  end if;
  select subject, message into v_old from public.support_tickets
   where id = p_ticket_id and user_id = v_uid and deleted_at is null
     and status in ('aberto', 'em_andamento')
   for update;
  if not found then
    return false;
  end if;
  insert into public.support_ticket_edits (ticket_id, edited_by, old_subject, old_message)
  values (p_ticket_id, v_uid, v_old.subject, v_old.message);
  update public.support_tickets
     set subject = btrim(p_subject), message = btrim(p_message), edited_at = now()
   where id = p_ticket_id;
  return true;
end;
$$;

-- Exclusão recuperável: só o dono; vai para a Lixeira do admin.
create or replace function public.support_ticket_owner_delete(p_ticket_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.support_tickets
     set deleted_at = now(), deleted_by = v_uid
   where id = p_ticket_id and user_id = v_uid and deleted_at is null;
  return found;
end;
$$;

revoke all on function public.support_ticket_owner_edit(uuid, text, text) from public, anon;
revoke all on function public.support_ticket_owner_delete(uuid) from public, anon;
grant execute on function public.support_ticket_owner_edit(uuid, text, text) to authenticated;
grant execute on function public.support_ticket_owner_delete(uuid) to authenticated;
