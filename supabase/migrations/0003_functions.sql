-- EventeIA — funções e triggers
-- Processamento atômico de webhooks (pagamentos + tíquetes + feeds) e ledger de créditos.

-- ============================================================
-- updated_at
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Perfil automático no signup (auth.users → profiles)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Anfitrião'
  );

  insert into public.profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ============================================================
-- Ledger de créditos: saldo nunca negativo, cálculo serializado
-- (.context/COMMERCIAL_MODEL.md §4)
-- ============================================================
create or replace function public.credit_ledger_guard()
returns trigger
language plpgsql
as $$
declare
  v_balance bigint;
begin
  -- Serializa inserções concorrentes por workspace.
  perform 1 from public.workspaces where id = new.workspace_id for update;
  if not found then
    raise exception 'workspace inexistente: %', new.workspace_id;
  end if;

  select coalesce(sum(amount_cents), 0)
    into v_balance
    from public.credit_ledger
   where workspace_id = new.workspace_id;

  v_balance := v_balance + new.amount_cents;

  if v_balance < 0 then
    raise exception 'saldo de créditos insuficiente no workspace %', new.workspace_id;
  end if;

  new.balance_after_cents := v_balance;
  return new;
end;
$$;

drop trigger if exists credit_ledger_guard on public.credit_ledger;
create trigger credit_ledger_guard
  before insert on public.credit_ledger
  for each row
  execute function public.credit_ledger_guard();

-- ============================================================
-- process_payment_webhook — idempotente e atômico
-- Retorna: processed | already_processed | rejected | unmapped |
--          no_payment | payment_not_found | not_found
-- ============================================================
create or replace function public.process_payment_webhook(p_webhook_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.webhook_events%rowtype;
  v_payment public.payments%rowtype;
  v_event_name text;
  v_asaas_payment_id text;
  v_new_status text;
begin
  select * into v_event
    from public.webhook_events
   where id = p_webhook_event_id
     for update;

  if not found then
    return 'not_found';
  end if;

  if v_event.status = 'processed' then
    return 'already_processed';
  end if;

  update public.webhook_events
     set status = 'processing', attempts = attempts + 1
   where id = v_event.id;

  v_event_name := v_event.payload ->> 'event';
  v_asaas_payment_id := v_event.payload -> 'payment' ->> 'id';

  if v_asaas_payment_id is null then
    update public.webhook_events
       set status = 'failed', last_error = 'payload sem payment.id'
     where id = v_event.id;
    return 'no_payment';
  end if;

  select * into v_payment
    from public.payments
   where asaas_payment_id = v_asaas_payment_id
     for update;

  if not found then
    update public.webhook_events
       set status = 'processed', processed_at = now(), last_error = 'pagamento não encontrado'
     where id = v_event.id;
    return 'payment_not_found';
  end if;

  v_new_status := case v_event_name
    when 'PAYMENT_CREATED' then 'pending'
    when 'PAYMENT_RECEIVED' then 'paid'
    when 'PAYMENT_CONFIRMED' then 'paid'
    when 'PAYMENT_OVERDUE' then 'overdue'
    when 'PAYMENT_REFUNDED' then 'refunded'
    when 'PAYMENT_AWAITING_RISK_ANALYSIS' then 'risk_review'
    when 'PAYMENT_CHARGEBACK_REQUESTED' then 'chargeback'
    else null
  end;

  if v_new_status is null then
    update public.webhook_events
       set status = 'processed', processed_at = now(), last_error = 'evento não mapeado'
     where id = v_event.id;

    insert into public.system_events
      (type, occurred_at, actor_type, aggregate_type, aggregate_id, payload, correlation_id, source)
    values
      ('webhook.unmapped_status', now(), 'webhook', 'payment', v_payment.id::text,
       jsonb_build_object('event', v_event_name), v_event.id::text, 'webhook');

    return 'unmapped';
  end if;

  -- Efeito idempotente: mesmo status ⇒ nada a fazer.
  if v_payment.status = v_new_status then
    update public.webhook_events
       set status = 'processed', processed_at = now()
     where id = v_event.id;
    return 'already_' || v_new_status;
  end if;

  -- Guarda da máquina de estados (.context/PAYMENTS.md §6).
  if not (
       (v_payment.status = 'pending'  and v_new_status in ('paid', 'overdue', 'risk_review', 'refunded'))
    or (v_payment.status = 'overdue'  and v_new_status in ('paid', 'pending', 'chargeback'))
    or (v_payment.status in ('paid', 'confirmed') and v_new_status in ('refunded', 'chargeback'))
    or (v_payment.status = 'risk_review' and v_new_status in ('paid', 'refunded', 'chargeback'))
  ) then
    update public.webhook_events
       set status = 'processed', processed_at = now(), last_error = 'transição rejeitada'
     where id = v_event.id;

    insert into public.system_events
      (type, occurred_at, actor_type, aggregate_type, aggregate_id, payload, correlation_id, source)
    values
      ('payment.transition_rejected', now(), 'webhook', 'payment', v_payment.id::text,
       jsonb_build_object('from', v_payment.status, 'to', v_new_status),
       v_event.id::text, 'webhook');

    return 'rejected';
  end if;

  update public.payments
     set status = v_new_status,
         confirmed_at = case when v_new_status = 'paid' then now() else confirmed_at end,
         refunded_at  = case when v_new_status = 'refunded' then now() else refunded_at end
   where id = v_payment.id;

  if v_new_status = 'paid'
     and v_payment.purpose = 'event_ticket'
     and v_payment.event_id is not null then
    update public.event_tickets
       set status = 'active', activated_at = now()
     where payment_id = v_payment.id
       and status = 'pending';
  end if;

  insert into public.system_events
    (type, occurred_at, actor_type, aggregate_type, aggregate_id, payload, correlation_id, source)
  values
    ('payment.' || case v_new_status
        when 'paid' then 'confirmed'
        when 'overdue' then 'overdue'
        when 'refunded' then 'refunded'
        when 'risk_review' then 'risk_review'
        when 'chargeback' then 'chargeback'
        else 'updated'
      end,
     now(), 'webhook', 'payment', v_payment.id::text,
     jsonb_build_object(
       'amount_cents', v_payment.amount_cents,
       'billing_type', v_payment.billing_type,
       'status', v_new_status
     ),
     v_event.id::text, 'webhook');

  update public.webhook_events
     set status = 'processed', processed_at = now(), last_error = null
   where id = v_event.id;

  return 'processed';
end;
$$;

revoke all on function public.process_payment_webhook(uuid) from public, anon, authenticated;
grant execute on function public.process_payment_webhook(uuid) to service_role;
