-- 0033 — Cupom de cortesia (gratuidade) + cupom de uso único por usuário +
-- reserva atômica de cupom no início do checkout (aditiva; não apaga dados).
--
-- 1) coupons.discount_type ganha 'free' (cortesia → total 0). Só admins criam
--    (server action com requireAdmin; tabela sem políticas para o cliente).
-- 2) payments aceita billing_type 'COURTESY' com amount_cents = 0 (somente
--    nesse caso; cobranças Asaas continuam > 0).
-- 3) coupon_redemptions: 1 uso por (cupom, usuário) — índice único parcial —
--    e reserva com lock da linha do cupom ⇒ max_redemptions respeitado sob
--    concorrência. Reservas de Pix/cartão abandonados (pagamento vencido/
--    estornado, ou sem pagamento após 15 min) são liberadas.
-- 4) redeem_courtesy_coupon: transação única que reserva, grava o pagamento
--    'COURTESY' como pago, ativa o tíquete (0014 ativa o evento) e conta a
--    redenção (trigger 0010). Idempotente por evento. Só service_role.

-- 1) tipo 'free'
alter table public.coupons drop constraint if exists coupons_discount_type_check;
alter table public.coupons
  add constraint coupons_discount_type_check
  check (discount_type in ('percent', 'fixed_cents', 'free'));

-- 2) pagamento de cortesia
alter table public.payments drop constraint if exists payments_billing_type_check;
alter table public.payments
  add constraint payments_billing_type_check
  check (billing_type in ('PIX', 'CREDIT_CARD', 'COURTESY'));

alter table public.payments drop constraint if exists payments_amount_cents_check;
alter table public.payments
  add constraint payments_amount_cents_check
  check (amount_cents > 0 or (billing_type = 'COURTESY' and amount_cents = 0));

-- 3) redenções por usuário
create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id),
  profile_id uuid not null references public.profiles (id),
  event_id uuid references public.events (id),
  payment_id uuid references public.payments (id),
  status text not null default 'reserved' check (status in ('reserved', 'redeemed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists coupon_redemptions_one_per_user
  on public.coupon_redemptions (coupon_id, profile_id)
  where status in ('reserved', 'redeemed');
create index if not exists coupon_redemptions_payment_idx
  on public.coupon_redemptions (payment_id) where payment_id is not null;

alter table public.coupon_redemptions enable row level security;
alter table public.coupon_redemptions force row level security;
-- Sem políticas: somente service_role / funções definer.
revoke all on public.coupon_redemptions from anon, authenticated;

-- Backfill: pagamentos já pagos com cupom contam como uso daquele usuário.
insert into public.coupon_redemptions (coupon_id, profile_id, event_id, payment_id, status)
select distinct on (c.id, p.profile_id) c.id, p.profile_id, p.event_id, p.id, 'redeemed'
  from public.payments p
  join public.coupons c on c.code = p.coupon_code
 where p.status in ('paid', 'confirmed')
 order by c.id, p.profile_id, p.created_at
on conflict do nothing;

-- Libera reservas sem efeito (pagamento vencido/estornado ou abandonado).
create or replace function public.release_stale_coupon_reservations(p_coupon_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coupon_redemptions r
     set status = 'released', updated_at = now()
   where r.coupon_id = p_coupon_id
     and r.status = 'reserved'
     and (
       (r.payment_id is null and r.created_at < now() - interval '15 minutes')
       or exists (
         select 1 from public.payments p
          where p.id = r.payment_id
            and p.status in ('overdue', 'refunded', 'chargeback')
       )
     );
$$;

-- Reserva atômica: lock do cupom, validação, uso único e limite global.
-- Retorna 'ok:<discount_type>:<value>' ou o motivo da recusa.
create or replace function public.reserve_coupon(
  p_code text, p_profile_id uuid, p_event_id uuid
) returns table (status text, reservation_id uuid, discount_type text, value integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons%rowtype;
  v_used integer;
  v_id uuid;
begin
  select * into v_coupon from public.coupons where code = p_code for update;
  if not found or not v_coupon.active
     or (v_coupon.expires_at is not null and v_coupon.expires_at <= now()) then
    return query select 'invalid'::text, null::uuid, null::text, null::integer;
    return;
  end if;

  perform public.release_stale_coupon_reservations(v_coupon.id);

  -- Reserva do mesmo usuário ainda viva para o MESMO evento ⇒ reutiliza (retry).
  select r.id into v_id
    from public.coupon_redemptions r
   where r.coupon_id = v_coupon.id and r.profile_id = p_profile_id
     and r.status = 'reserved' and r.event_id is not distinct from p_event_id;
  if found then
    return query select 'ok'::text, v_id, v_coupon.discount_type, v_coupon.value;
    return;
  end if;

  if exists (
    select 1 from public.coupon_redemptions r
     where r.coupon_id = v_coupon.id and r.profile_id = p_profile_id
       and r.status in ('reserved', 'redeemed')
  ) then
    return query select 'already_used'::text, null::uuid, null::text, null::integer;
    return;
  end if;

  select count(*) into v_used
    from public.coupon_redemptions r
   where r.coupon_id = v_coupon.id and r.status in ('reserved', 'redeemed');
  if v_coupon.max_redemptions is not null
     and greatest(v_used, v_coupon.redemptions) >= v_coupon.max_redemptions then
    return query select 'exhausted'::text, null::uuid, null::text, null::integer;
    return;
  end if;

  insert into public.coupon_redemptions (coupon_id, profile_id, event_id)
  values (v_coupon.id, p_profile_id, p_event_id)
  returning id into v_id;

  return query select 'ok'::text, v_id, v_coupon.discount_type, v_coupon.value;
end;
$$;

-- Vincula a reserva ao pagamento criado no Asaas.
create or replace function public.attach_coupon_reservation(p_reservation_id uuid, p_payment_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coupon_redemptions
     set payment_id = p_payment_id, updated_at = now()
   where id = p_reservation_id and status = 'reserved';
$$;

-- Pagamento confirmado ⇒ reserva vira 'redeemed'.
create or replace function public.mark_coupon_redemption_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and old.status <> 'paid' then
    update public.coupon_redemptions
       set status = 'redeemed', updated_at = now()
     where payment_id = new.id and status <> 'redeemed';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_coupon_redemption_mark on public.payments;
create trigger payments_coupon_redemption_mark
  after update on public.payments
  for each row execute function public.mark_coupon_redemption_paid();

-- 4) Checkout de cortesia (total 0, sem Asaas).
create or replace function public.redeem_courtesy_coupon(
  p_code text, p_profile_id uuid, p_event_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_res record;
  v_payment_id uuid;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.owner_profile_id <> p_profile_id then
    return 'event_not_found';
  end if;
  if v_event.status = 'active'
     or exists (select 1 from public.event_tickets t where t.event_id = p_event_id and t.status = 'active') then
    return 'already_active';
  end if;

  select * into v_res from public.reserve_coupon(p_code, p_profile_id, p_event_id);
  if v_res.status <> 'ok' then
    return v_res.status;
  end if;
  if v_res.discount_type <> 'free' then
    -- Não é cortesia: desfaz a reserva (a transação inteira do chamador segue).
    update public.coupon_redemptions set status = 'released', updated_at = now()
     where id = v_res.reservation_id;
    return 'not_courtesy';
  end if;

  insert into public.payments
    (profile_id, purpose, event_id, asaas_payment_id, billing_type, amount_cents,
     coupon_code, discount_cents, status)
  values
    (p_profile_id, 'event_ticket', p_event_id, 'courtesy:' || gen_random_uuid()::text,
     'COURTESY', 0, p_code, 0, 'pending')
  returning id into v_payment_id;

  perform public.attach_coupon_reservation(v_res.reservation_id, v_payment_id);

  -- pending → paid dispara 0010 (redemptions+1) e mark_coupon_redemption_paid.
  update public.payments set status = 'paid', confirmed_at = now() where id = v_payment_id;

  insert into public.event_tickets (event_id, status, payment_id, activated_at)
  values (p_event_id, 'active', v_payment_id, now())
  on conflict (event_id) do update
     set status = 'active', payment_id = excluded.payment_id, activated_at = now();

  insert into public.system_events
    (type, occurred_at, actor_type, aggregate_type, aggregate_id, payload, correlation_id, source)
  values
    ('payment.courtesy', now(), 'user', 'payment', v_payment_id::text,
     jsonb_build_object('coupon', p_code, 'event_id', p_event_id), v_payment_id::text, 'app');

  return 'activated';
end;
$$;

revoke all on function public.release_stale_coupon_reservations(uuid) from public, anon, authenticated;
revoke all on function public.reserve_coupon(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.attach_coupon_reservation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_coupon_redemption_paid() from public, anon, authenticated;
revoke all on function public.redeem_courtesy_coupon(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_stale_coupon_reservations(uuid) to service_role;
grant execute on function public.reserve_coupon(text, uuid, uuid) to service_role;
grant execute on function public.attach_coupon_reservation(uuid, uuid) to service_role;
grant execute on function public.redeem_courtesy_coupon(text, uuid, uuid) to service_role;
