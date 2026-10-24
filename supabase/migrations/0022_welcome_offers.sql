-- Oferta de boas-vindas (novo visitante): cupom de tíquete único por R$ 47 com prazo REAL.
--
-- ┌─ Nota de revisão de segurança (security review) ───────────────────────────────┐
-- │ LGPD: nenhum IP bruto é gravado. O app grava apenas HMAC-SHA256(salt, ip) e      │
-- │   HMAC-SHA256(salt, device_id) — o salt (WELCOME_HASH_SALT) vive só no servidor. │
-- │ RLS: tabelas com RLS FORÇADA; anon/authenticated sem acesso. Somente admin lê     │
-- │   (is_admin()); escrita só via funções SECURITY DEFINER executáveis por           │
-- │   service_role (EXECUTE revogado de public/anon/authenticated).                  │
-- │ Prazo: expires_at é definido pelo banco (now() + 24h) e validado com now() do    │
-- │   banco no checkout — nunca confia no relógio/estado do client.                  │
-- │ Unicidade: 1 oferta por ip_hash, por device_hash e por conta (índices únicos) —   │
-- │   expirar não libera nova oferta (a linha permanece).                            │
-- │ Abuso: rate limit por ip_hash (30 req/min) dentro da função; código não          │
-- │   enumerável (sem SELECT público) e preso a 1 conta e 1 evento.                  │
-- │ Migração aditiva (expand): não altera tabelas existentes além de um trigger novo.│
-- └──────────────────────────────────────────────────────────────────────────────────┘

create table public.welcome_offers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  ip_hash text not null check (char_length(ip_hash) = 64),
  device_hash text not null check (char_length(device_hash) = 64),
  profile_id uuid references public.profiles (id),
  source text not null check (source in ('new_ip', 'convite', 'promo')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  bound_at timestamptz,
  reserved_event_id uuid references public.events (id),
  redeemed_at timestamptz,
  payment_id uuid references public.payments (id),
  check (expires_at > created_at)
);

create unique index welcome_offers_ip_uniq on public.welcome_offers (ip_hash);
create unique index welcome_offers_device_uniq on public.welcome_offers (device_hash);
create unique index welcome_offers_profile_uniq on public.welcome_offers (profile_id) where profile_id is not null;

alter table public.welcome_offers enable row level security;
alter table public.welcome_offers force row level security;

create policy "welcome_offers: admin lê"
  on public.welcome_offers for select to authenticated
  using (public.is_admin());

create table public.welcome_rate_limits (
  ip_hash text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (ip_hash, window_start)
);

alter table public.welcome_rate_limits enable row level security;
alter table public.welcome_rate_limits force row level security;
-- Sem políticas: só funções SECURITY DEFINER tocam esta tabela.

-- Consulta (p_claim=false) ou emissão (p_claim=true) da oferta do visitante.
-- Retorna status: active | expired | redeemed | ineligible | none.
create or replace function public.welcome_offer_lookup(
  p_ip_hash text,
  p_device_hash text,
  p_profile_id uuid,
  p_source text,
  p_claim boolean
)
returns table (status text, code text, expires_at timestamptz, server_now timestamptz, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.welcome_offers;
  v_hits integer;
  v_created boolean := false;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' or p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_hash' using errcode = '22023';
  end if;

  -- Rate limit por IP (janela de 1 minuto).
  insert into public.welcome_rate_limits as r (ip_hash, window_start, hits)
  values (p_ip_hash, date_trunc('minute', now()), 1)
  on conflict (ip_hash, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  delete from public.welcome_rate_limits
   where ip_hash = p_ip_hash and window_start < now() - interval '1 hour';

  if v_hits > 30 then
    raise exception 'rate_limited' using errcode = 'P0429';
  end if;

  select * into v_row from public.welcome_offers w
   where w.device_hash = p_device_hash
      or (p_profile_id is not null and w.profile_id = p_profile_id)
   order by (w.profile_id = p_profile_id) desc nulls last
   limit 1;

  if not found then
    if not p_claim
       or exists (select 1 from public.welcome_offers w where w.ip_hash = p_ip_hash) then
      return query select (case when p_claim then 'ineligible' else 'none' end)::text,
        null::text, null::timestamptz, now(), false;
      return;
    end if;

    if p_source not in ('new_ip', 'convite', 'promo') then
      p_source := 'new_ip';
    end if;

    begin
      insert into public.welcome_offers (code, ip_hash, device_hash, profile_id, source, bound_at)
      values (
        'BEMVINDO-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)),
        p_ip_hash, p_device_hash, p_profile_id, p_source,
        case when p_profile_id is null then null else now() end
      )
      returning * into v_row;
      v_created := true;
    exception when unique_violation then
      return query select 'ineligible'::text, null::text, null::timestamptz, now(), false;
      return;
    end;
  elsif p_profile_id is not null and v_row.profile_id is null
        and not exists (select 1 from public.welcome_offers w where w.profile_id = p_profile_id) then
    update public.welcome_offers w set profile_id = p_profile_id, bound_at = now()
     where w.id = v_row.id
     returning * into v_row;
  elsif p_profile_id is not null and v_row.profile_id is not null and v_row.profile_id <> p_profile_id then
    -- Oferta deste aparelho pertence a outra conta: não é transferível.
    return query select 'ineligible'::text, null::text, null::timestamptz, now(), false;
    return;
  end if;

  return query select
    (case
       when v_row.redeemed_at is not null then 'redeemed'
       when v_row.expires_at <= now() then 'expired'
       else 'active'
     end)::text,
    (case when v_row.redeemed_at is null and v_row.expires_at > now() then v_row.code else null end),
    v_row.expires_at, now(), v_created;
end;
$$;

-- Checkout: reserva a oferta da conta para UM evento. Validação com now() do banco.
create or replace function public.welcome_offer_reserve(p_profile_id uuid, p_event_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.welcome_offers w
     set reserved_event_id = p_event_id
   where w.profile_id = p_profile_id
     and w.redeemed_at is null
     and w.expires_at > now()
     and (w.reserved_event_id is null or w.reserved_event_id = p_event_id)
  returning w.code, w.expires_at;
end;
$$;

-- Prova social com dado REAL: quantas ofertas foram usadas nos últimos 30 dias.
create or replace function public.welcome_offer_recent_redemptions()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.welcome_offers
   where redeemed_at is not null and redeemed_at > now() - interval '30 days';
$$;

revoke all on function public.welcome_offer_lookup(text, text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.welcome_offer_reserve(uuid, uuid) from public, anon, authenticated;
revoke all on function public.welcome_offer_recent_redemptions() from public, anon, authenticated;
grant execute on function public.welcome_offer_lookup(text, text, uuid, text, boolean) to service_role;
grant execute on function public.welcome_offer_reserve(uuid, uuid) to service_role;
grant execute on function public.welcome_offer_recent_redemptions() to service_role;

-- Redenção: só na confirmação do pagamento (paid/confirmed), uma vez.
create or replace function public.register_welcome_redemption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('paid', 'confirmed') and old.status not in ('paid', 'confirmed')
     and new.coupon_code like 'BEMVINDO-%' then
    update public.welcome_offers
       set redeemed_at = now(), payment_id = new.id
     where code = new.coupon_code
       and profile_id = new.profile_id
       and redeemed_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.register_welcome_redemption() from public, anon, authenticated;

create trigger payments_welcome_redemption
  after update on public.payments
  for each row
  execute function public.register_welcome_redemption();
