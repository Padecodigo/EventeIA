-- 0043: chamados — "Encerrar" (quem/quando), "Reabrir" e "Excluir" recuperável (soft delete).
-- ADITIVA: só colunas novas, índices e um trigger. Nada é apagado.
-- RLS: inalterada. support_tickets já tem "admin tudo" (is_admin()) e o dono só lê/insere;
-- o grant de UPDATE para authenticated (0027) continua efetivo só para admin via RLS.
-- O dono do chamado NÃO consegue encerrar/excluir (não tem política de update).

alter table public.support_tickets add column if not exists closed_at timestamptz;
alter table public.support_tickets add column if not exists closed_by uuid references public.profiles (id) on delete set null;
alter table public.support_tickets add column if not exists deleted_at timestamptz;
alter table public.support_tickets add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

create index if not exists support_tickets_closed_by_idx on public.support_tickets (closed_by) where closed_by is not null;
create index if not exists support_tickets_deleted_by_idx on public.support_tickets (deleted_by) where deleted_by is not null;
create index if not exists support_tickets_active_created_idx on public.support_tickets (created_at desc) where deleted_at is null;

-- Mantém closed_at coerente com o status (inclusive quando o status muda pelo seletor ou
-- por resposta do usuário): ao virar 'fechado' grava a hora; ao sair de 'fechado' limpa.
create or replace function public.support_ticket_close_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'fechado' and old.status is distinct from 'fechado' then
    new.closed_at := coalesce(new.closed_at, now());
  elsif new.status <> 'fechado' then
    new.closed_at := null;
    new.closed_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.support_ticket_close_stamp() from public, anon, authenticated;

drop trigger if exists support_tickets_close_stamp on public.support_tickets;
create trigger support_tickets_close_stamp
  before update on public.support_tickets
  for each row execute function public.support_ticket_close_stamp();
