-- Cupom sorteado ("Quer cupom?") + perda da oferta de boas-vindas na visita seguinte.
--
-- Regras:
--  * Boas-vindas (0022) vale só na 1ª VISITA: numa visita posterior (outro visit_hash) ou após
--    expirar, é perdida para sempre (expires_at := now(), forfeited_at registrado).
--  * Sem boas-vindas ativa, o visitante pode sortear 20%..40% (sorteio no SERVIDOR, crypto).
--  * Um sorteio por janela (padrão 48h, constante do app, limitado no banco a 1..168h): tentar
--    de novo dentro da janela devolve o MESMO cupom. Após a janela, novo sorteio invalida o
--    anterior. Validade do cupom <= janela.
--
-- ┌─ Nota de revisão de segurança / Supabase ─────────────────────────────────────────┐
-- │ Percentual validado no banco (CHECK 20..40 + validação na função); client nunca o   │
-- │   envia. Checkout lê o percentual GRAVADO (lucky_coupon_reserve).                   │
-- │ Concorrência: pg_advisory_xact_lock por aparelho ⇒ cliques simultâneos não geram    │
-- │   dois sorteios na mesma janela.                                                    │
-- │ Exclusividade: só elegível com boas-vindas NÃO ativa — nunca as duas juntas.        │
-- │ LGPD: só HMACs (mesmo salt da 0022); nenhum IP bruto.                               │
-- │ RLS FORÇADA; só admin lê; escrita só via SECURITY DEFINER executável por            │
-- │   service_role. Tempo sempre pelo now() do banco.                                   │
-- │ Migração aditiva: 2 colunas NULLABLE novas em welcome_offers; sem DROP/DELETE.      │
-- └────────────────────────────────────────────────────────────────────────────────────┘

alter table public.welcome_offers add column if not exists visit_hash text check (visit_hash is null or char_length(visit_hash) = 64);
alter table public.welcome_offers add column if not exists forfeited_at timestamptz;

-- Marca a visita da oferta; numa visita diferente (ou sem cookie de visita) a oferta ativa é perdida.
create or replace function public.welcome_offer_touch_visit(p_device_hash text, p_profile_id uuid, p_visit_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.welcome_offers;
begin
  if p_device_hash !~ '^[0-9a-f]{64}$' or (p_visit_hash is not null and p_visit_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid_hash' using errcode = '22023';
  end if;
  select * into v_row from public.welcome_offers w
   where w.device_hash = p_device_hash
      or (p_profile_id is not null and w.profile_id = p_profile_id)
   order by (w.profile_id = p_profile_id) desc nulls last
   limit 1
   for update;
  if not found or v_row.redeemed_at is not null or v_row.forfeited_at is not null or v_row.expires_at <= now() then
    return 'noop';
  end if;
  if v_row.visit_hash is null then
    if p_visit_hash is null then
      return 'noop';
    end if;
    update public.welcome_offers set visit_hash = p_visit_hash where id = v_row.id;
    return 'bound';
  end if;
  if p_visit_hash is distinct from v_row.visit_hash then
    update public.welcome_offers
       set forfeited_at = now(), expires_at = greatest(now(), created_at + interval '1 millisecond')
     where id = v_row.id;
    return 'forfeited';
  end if;
  return 'same_visit';
end;
$$;

create table public.lucky_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  ip_hash text not null check (char_length(ip_hash) = 64),
  device_hash text not null check (char_length(device_hash) = 64),
  profile_id uuid references public.profiles (id),
  percent integer not null check (percent between 20 and 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redraw_at timestamptz not null,
  superseded_at timestamptz,
  reserved_event_id uuid references public.events (id),
  redeemed_at timestamptz,
  payment_id uuid references public.payments (id),
  check (expires_at > created_at),
  check (expires_at <= redraw_at)
);

create index lucky_coupons_device_idx on public.lucky_coupons (device_hash, created_at desc);
create index lucky_coupons_profile_idx on public.lucky_coupons (profile_id, created_at desc) where profile_id is not null;

alter table public.lucky_coupons enable row level security;
alter table public.lucky_coupons force row level security;

create policy "lucky_coupons: admin lê"
  on public.lucky_coupons for select to authenticated
  using (public.is_admin());

-- Consulta (p_percent null) ou sorteio (p_percent sorteado no servidor).
-- status: available | active | expired | redeemed | ineligible. redraw_at = próximo sorteio.
create or replace function public.lucky_coupon_lookup(
  p_ip_hash text,
  p_device_hash text,
  p_profile_id uuid,
  p_percent integer,
  p_window_hours integer,
  p_validity_hours integer
)
returns table (status text, code text, percent integer, expires_at timestamptz, redraw_at timestamptz, server_now timestamptz, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lucky_coupons;
  v_found boolean;
  v_welcome public.welcome_offers;
  v_hits integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' or p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_hash' using errcode = '22023';
  end if;
  if p_percent is not null and (p_percent < 20 or p_percent > 40) then
    raise exception 'invalid_percent' using errcode = '22023';
  end if;
  if p_window_hours is null or p_window_hours < 1 or p_window_hours > 168
     or p_validity_hours is null or p_validity_hours < 1 or p_validity_hours > p_window_hours then
    raise exception 'invalid_window' using errcode = '22023';
  end if;

  insert into public.welcome_rate_limits as r (ip_hash, window_start, hits)
  values (p_ip_hash, date_trunc('minute', now()), 1)
  on conflict (ip_hash, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  if v_hits > 30 then
    raise exception 'rate_limited' using errcode = 'P0429';
  end if;

  -- Serializa sorteios do mesmo aparelho/conta (cliques simultâneos).
  perform pg_advisory_xact_lock(hashtext('lucky:' || p_device_hash));
  if p_profile_id is not null then
    perform pg_advisory_xact_lock(hashtext('lucky:' || p_profile_id::text));
  end if;

  -- Elegível só com boas-vindas existente e NÃO ativa (expirada, perdida ou usada).
  select * into v_welcome from public.welcome_offers w
   where w.device_hash = p_device_hash
      or (p_profile_id is not null and w.profile_id = p_profile_id)
   order by (w.profile_id = p_profile_id) desc nulls last
   limit 1;
  if not found
     or (v_welcome.redeemed_at is null and v_welcome.forfeited_at is null and v_welcome.expires_at > now())
     or (p_profile_id is not null and v_welcome.profile_id is not null and v_welcome.profile_id <> p_profile_id) then
    return query select 'ineligible'::text, null::text, null::integer, null::timestamptz, null::timestamptz, now(), false;
    return;
  end if;

  select * into v_row from public.lucky_coupons l
   where l.device_hash = p_device_hash
      or (p_profile_id is not null and l.profile_id = p_profile_id)
   order by l.created_at desc
   limit 1;
  v_found := found;

  if v_found and p_profile_id is not null and v_row.profile_id is not null and v_row.profile_id <> p_profile_id then
    return query select 'ineligible'::text, null::text, null::integer, null::timestamptz, null::timestamptz, now(), false;
    return;
  end if;

  if not v_found or v_row.redraw_at <= now() then
    -- Fora de janela: pode sortear.
    if p_percent is null then
      return query select 'available'::text, null::text, null::integer, null::timestamptz, null::timestamptz, now(), false;
      return;
    end if;
    if v_found then
      update public.lucky_coupons l
         set superseded_at = now(), expires_at = least(l.expires_at, greatest(now(), l.created_at + interval '1 millisecond'))
       where l.id = v_row.id and l.superseded_at is null;
    end if;
    insert into public.lucky_coupons (code, ip_hash, device_hash, profile_id, percent, expires_at, redraw_at)
    values ('SORTE-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)),
            p_ip_hash, p_device_hash, p_profile_id, p_percent,
            now() + make_interval(hours => p_validity_hours),
            now() + make_interval(hours => p_window_hours))
    returning * into v_row;
    return query select 'active'::text, v_row.code, v_row.percent, v_row.expires_at, v_row.redraw_at, now(), true;
    return;
  end if;

  -- Dentro da janela: devolve o mesmo cupom (nunca re-sorteia).
  if p_profile_id is not null and v_row.profile_id is null then
    update public.lucky_coupons l set profile_id = p_profile_id where l.id = v_row.id returning * into v_row;
  end if;

  return query select
    (case when v_row.redeemed_at is not null then 'redeemed'
          when v_row.expires_at <= now() then 'expired'
          else 'active' end)::text,
    (case when v_row.redeemed_at is null and v_row.expires_at > now() then v_row.code else null end),
    v_row.percent, v_row.expires_at, v_row.redraw_at, now(), false;
end;
$$;

-- Checkout: reserva o cupom da conta para UM evento; percentual vem do BANCO.
create or replace function public.lucky_coupon_reserve(p_profile_id uuid, p_event_id uuid)
returns table (code text, percent integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.lucky_coupons l
     set reserved_event_id = p_event_id
   where l.profile_id = p_profile_id
     and l.redeemed_at is null
     and l.expires_at > now()
     and l.superseded_at is null
     and (l.reserved_event_id is null or l.reserved_event_id = p_event_id)
  returning l.code, l.percent, l.expires_at;
end;
$$;

revoke all on function public.welcome_offer_touch_visit(text, uuid, text) from public, anon, authenticated;
grant execute on function public.welcome_offer_touch_visit(text, uuid, text) to service_role;
revoke all on function public.lucky_coupon_lookup(text, text, uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.lucky_coupon_reserve(uuid, uuid) from public, anon, authenticated;
grant execute on function public.lucky_coupon_lookup(text, text, uuid, integer, integer, integer) to service_role;
grant execute on function public.lucky_coupon_reserve(uuid, uuid) to service_role;

create or replace function public.register_lucky_redemption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('paid', 'confirmed') and old.status not in ('paid', 'confirmed')
     and new.coupon_code like 'SORTE-%' then
    update public.lucky_coupons
       set redeemed_at = now(), payment_id = new.id
     where code = new.coupon_code
       and profile_id = new.profile_id
       and redeemed_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.register_lucky_redemption() from public, anon, authenticated;

create trigger payments_lucky_redemption
  after update on public.payments
  for each row
  execute function public.register_lucky_redemption();
