-- 0029 — Guardas de estado de pagamento contra escrita direta do cliente (aditiva).
--
-- Bug (segurança/integridade): as políticas RLS de 0002 deixam o dono do
-- evento escrever QUALQUER coluna via PostgREST com a anon key + JWT:
--   * events.status = 'active'  (ativa o evento sem pagar → descoberta/WhatsApp/IA grátis);
--   * event_tickets.status = 'active' (o trigger 0014 então ativa o evento);
--   * payments com status 'paid' (polui o financeiro e o histórico).
-- Correção: triggers BEFORE que só valem para os papéis do cliente
-- (authenticated/anon). service_role e funções security definer
-- (process_payment_webhook, ativação por crédito) continuam livres.
-- Não altera nem apaga dados existentes.

-- ------------------------------------------------------------------
-- events: cliente só cria em draft/awaiting_payment e só move
-- draft -> awaiting_payment; colunas do pipeline são do servidor
-- (whatsapp_channel segue editável pelo dono — decisão de 0024).
-- ------------------------------------------------------------------
create or replace function public.guard_events_client_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'awaiting_payment') then
      raise exception 'status de evento não permitido para o cliente: %', new.status
        using errcode = '42501';
    end if;
    if new.discovery_started_at is not null or new.discovery_ends_at is not null
       or new.discovery_status is not null or new.collection_ended_at is not null
       or new.quotes_delivered_at is not null then
      raise exception 'campos do pipeline são definidos pelo servidor' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'draft' and new.status = 'awaiting_payment') then
    raise exception 'transição de status de evento não permitida para o cliente: % -> %',
      old.status, new.status using errcode = '42501';
  end if;

  if new.owner_profile_id is distinct from old.owner_profile_id
     or new.discovery_started_at is distinct from old.discovery_started_at
     or new.discovery_ends_at is distinct from old.discovery_ends_at
     or new.discovery_status is distinct from old.discovery_status
     or new.collection_ended_at is distinct from old.collection_ended_at
     or new.quotes_delivered_at is distinct from old.quotes_delivered_at then
    raise exception 'campos do pipeline são definidos pelo servidor' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists events_guard_client_write on public.events;
create trigger events_guard_client_write
  before insert or update on public.events
  for each row execute function public.guard_events_client_write();

-- ------------------------------------------------------------------
-- event_tickets: cliente só registra/atualiza tíquete PENDENTE, apontando
-- para um pagamento próprio. Ativação = webhook (definer) ou service_role.
-- ------------------------------------------------------------------
create or replace function public.guard_event_tickets_client_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status <> 'pending' or new.activated_at is not null then
    raise exception 'tíquete só é ativado pela confirmação do pagamento' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.status <> 'pending' then
    raise exception 'tíquete já processado não pode ser alterado pelo cliente' using errcode = '42501';
  end if;

  if new.payment_id is not null and not exists (
    select 1 from public.payments p
     where p.id = new.payment_id
       and p.profile_id = auth.uid()
       and p.event_id = new.event_id
  ) then
    raise exception 'pagamento do tíquete inválido' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists event_tickets_guard_client_write on public.event_tickets;
create trigger event_tickets_guard_client_write
  before insert or update on public.event_tickets
  for each row execute function public.guard_event_tickets_client_write();

-- ------------------------------------------------------------------
-- payments: cliente só registra cobrança PENDENTE, sem campos de baixa.
-- (Não há política de UPDATE/DELETE para o cliente — já negado pela RLS.)
-- ------------------------------------------------------------------
create or replace function public.guard_payments_client_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status <> 'pending' or new.confirmed_at is not null or new.refunded_at is not null
     or new.asaas_fee_cents is not null or new.net_cents is not null then
    raise exception 'pagamento só nasce pendente; a baixa vem do webhook' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_guard_client_insert on public.payments;
create trigger payments_guard_client_insert
  before insert on public.payments
  for each row execute function public.guard_payments_client_insert();

revoke all on function public.guard_events_client_write() from public, anon, authenticated;
revoke all on function public.guard_event_tickets_client_write() from public, anon, authenticated;
revoke all on function public.guard_payments_client_insert() from public, anon, authenticated;
