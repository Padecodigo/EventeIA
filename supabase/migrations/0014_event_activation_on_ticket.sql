-- 0014 — Ativa o evento quando o tíquete B2C fica ativo (aditiva).
-- Bug: process_payment_webhook ativava só event_tickets; o evento ficava
-- "Aguardando pagamento" no painel mesmo pago. Trigger idempotente, sem
-- alterar a função existente.

create or replace function public.activate_event_on_ticket_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    update public.events
       set status = 'active'
     where id = new.event_id
       and status in ('draft', 'awaiting_payment');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_tickets_activate_event on public.event_tickets;
create trigger trg_event_tickets_activate_event
  after insert or update of status on public.event_tickets
  for each row execute function public.activate_event_on_ticket_active();

-- Backfill: eventos com tíquete ativo que ficaram presos aguardando pagamento.
update public.events e
   set status = 'active'
  from public.event_tickets t
 where t.event_id = e.id
   and t.status = 'active'
   and e.status in ('draft', 'awaiting_payment');
