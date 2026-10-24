-- Cupons de desconto (B2C — tíquete por evento).
-- Regra de ouro: o desconto é SEMPRE calculado no servidor; o client só envia o código.
-- Redenção conta na CONFIRMAÇÃO do pagamento (Pix abandonado não queima cupom).

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed_cents')),
  -- percent: 1..90 (por cento) · fixed_cents: centavos
  value integer not null check (value > 0),
  active boolean not null default true,
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemptions integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;
alter table public.coupons force row level security;
-- Sem políticas de leitura: código de cupom não é enumerável por anon/authenticated.
-- Validação e escrita acontecem via service_role (server actions/seed).

alter table public.payments
  add column coupon_code text,
  add column discount_cents integer not null default 0 check (discount_cents >= 0);

-- Redenção idempotente: só na transição -> paid (uma vez por pagamento).
create or replace function public.register_coupon_redemption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and old.status <> 'paid' and new.coupon_code is not null then
    update public.coupons
       set redemptions = redemptions + 1
     where code = new.coupon_code;

    insert into public.system_events
      (type, occurred_at, actor_type, aggregate_type, aggregate_id, payload, correlation_id, source)
    values
      ('coupon.redeemed', now(), 'webhook', 'payment', new.id::text,
       jsonb_build_object('coupon', new.coupon_code, 'discount_cents', new.discount_cents),
       new.id::text, 'webhook');
  end if;
  return new;
end;
$$;

drop trigger if exists payments_coupon_redemption on public.payments;
create trigger payments_coupon_redemption
  after update on public.payments
  for each row
  execute function public.register_coupon_redemption();
