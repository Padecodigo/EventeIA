-- Assinatura recorrente (Asaas): faturas mensais concedem a franquia automaticamente.
-- Sem mudança de schema (subscriptions/plans/credit_ledger já existem) — apenas a
-- função de processamento passa a tratar purpose='subscription_invoice'.
-- Fonte da verdade: .context/PAYMENTS.md §7 e .context/COMMERCIAL_MODEL.md §3.

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
  v_asaas_subscription_id text;
  v_new_status text;
  v_workspace_id uuid;
  v_sub public.subscriptions%rowtype;
  v_owner_id uuid;
  v_plan_credits integer;
  v_plan_price bigint;
  v_subscription_found boolean;
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
  v_asaas_subscription_id := v_event.payload -> 'payment' ->> 'subscription';

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

  -- Fatura de assinatura desconhecida: bootstrapa o pagamento local a partir
  -- da assinatura (o planner não cria cobrança avulsa — o Asaas gera a fatura).
  if not found and v_asaas_subscription_id is not null then
    select * into v_sub
      from public.subscriptions
     where asaas_subscription_id = v_asaas_subscription_id;

    if found then
      select owner_id into v_owner_id
        from public.workspaces
       where id = v_sub.workspace_id;

      select price_cents into v_plan_price
        from public.plans
       where code = v_sub.plan_code;

      if v_owner_id is not null and v_plan_price is not null then
        insert into public.payments
          (profile_id, purpose, asaas_payment_id, billing_type, amount_cents, status, workspace_id)
        values
          (v_owner_id, 'subscription_invoice', v_asaas_payment_id, 'PIX', v_plan_price,
           'pending', v_sub.workspace_id);

        select * into v_payment
          from public.payments
         where asaas_payment_id = v_asaas_payment_id
           for update;
      end if;
    end if;
  end if;

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

  if v_payment.status = v_new_status then
    update public.webhook_events
       set status = 'processed', processed_at = now()
     where id = v_event.id;
    return 'already_' || v_new_status;
  end if;

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

  -- Tíquete B2C: ativa o evento.
  if v_new_status = 'paid'
     and v_payment.purpose = 'event_ticket'
     and v_payment.event_id is not null then
    update public.event_tickets
       set status = 'active', activated_at = now()
     where payment_id = v_payment.id
       and status = 'pending';
  end if;

  -- Pacote avulso (top-up): concede créditos comprados (100 centavos por crédito).
  if v_new_status = 'paid'
     and v_payment.purpose = 'credit_topup'
     and v_payment.credits_granted is not null then
    v_workspace_id := v_payment.workspace_id;

    if v_workspace_id is null then
      select id into v_workspace_id
        from public.workspaces
       where owner_id = v_payment.profile_id
       order by created_at
       limit 1;
    end if;

    if v_workspace_id is not null then
      insert into public.credit_ledger
        (workspace_id, entry_type, amount_cents, balance_after_cents, idempotency_key,
         source_payment_id, note)
      values
        (v_workspace_id, 'topup', v_payment.credits_granted * 100, 0,
         'topup:' || v_payment.asaas_payment_id, v_payment.id, 'pacote de créditos')
      on conflict (idempotency_key) do nothing;

      insert into public.system_events
        (type, occurred_at, actor_type, aggregate_type, aggregate_id, payload, correlation_id, source)
      values
        ('credits.granted', now(), 'webhook', 'workspace', v_workspace_id::text,
         jsonb_build_object('amount_cents', v_payment.credits_granted * 100, 'entry_type', 'topup'),
         v_event.id::text, 'webhook');
    end if;
  end if;

  -- Fatura da assinatura: concede a franquia do plano e renova o ciclo.
  if v_new_status = 'paid' and v_payment.purpose = 'subscription_invoice' then
    v_subscription_found := false;

    if v_asaas_subscription_id is not null then
      select * into v_sub
        from public.subscriptions
       where asaas_subscription_id = v_asaas_subscription_id
         and (v_payment.workspace_id is null or workspace_id = v_payment.workspace_id);
      v_subscription_found := found;
    end if;

    if not v_subscription_found and v_payment.workspace_id is not null then
      select * into v_sub
        from public.subscriptions
       where workspace_id = v_payment.workspace_id
       order by created_at desc
       limit 1;
      v_subscription_found := found;
    end if;

    if v_subscription_found then
      select monthly_credits into v_plan_credits
        from public.plans
       where code = v_sub.plan_code;

      if v_plan_credits is not null and v_plan_credits > 0 then
        insert into public.credit_ledger
          (workspace_id, entry_type, amount_cents, balance_after_cents, expires_at,
           idempotency_key, source_payment_id, source_subscription_id, note)
        values
          (v_sub.workspace_id, 'grant', v_plan_credits * 100, 0, now() + interval '2 months',
           'grant:sub:' || v_sub.asaas_subscription_id || ':pay:' || v_payment.asaas_payment_id,
           v_payment.id, v_sub.id, 'franquia mensal')
        on conflict (idempotency_key) do nothing;

        update public.subscriptions
           set status = 'active',
               current_period_start = now()::date,
               current_period_end = (now() + interval '1 month')::date
         where id = v_sub.id;

        insert into public.system_events
          (type, occurred_at, actor_type, aggregate_type, aggregate_id, payload, correlation_id, source)
        values
          ('credits.granted', now(), 'webhook', 'workspace', v_sub.workspace_id::text,
           jsonb_build_object('amount_cents', v_plan_credits * 100, 'entry_type', 'grant'),
           v_event.id::text, 'webhook');

        insert into public.system_events
          (type, occurred_at, actor_type, aggregate_type, aggregate_id, payload, correlation_id, source)
        values
          ('subscription.renewed', now(), 'webhook', 'workspace', v_sub.workspace_id::text,
           jsonb_build_object('plan_code', v_sub.plan_code, 'credits', v_plan_credits),
           v_event.id::text, 'webhook');
      end if;
    end if;
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
