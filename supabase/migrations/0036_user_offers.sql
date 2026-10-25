-- 0036 — Ofertas pessoais do usuário LOGADO (aditiva; não apaga nem altera dados).
--
-- 1) Boas-vindas (kind='welcome'): criada no 1º acesso autenticado (inclusive
--    contas antigas: a janela começa no PRÓXIMO acesso — sem backfill expirado).
--    48h com prazo do BANCO: R$ 40 off no evento avulso OU 30% off em pacotes /
--    slider / 1ª fatura da franquia. Uso ÚNICO no total (1ª compra elegível).
-- 2) "Quer cupom?" (kind='personal'): depois da boas-vindas, 1 cupom novo por
--    usuário a cada p_cooldown_days (app: 90). R$ 20 off avulso OU 20% off pacotes;
--    48h; uso único; preso ao profile_id.
-- Sem acumular com cupom digitado (o app aplica o MAIOR dos dois). Piso R$ 9 no app.
-- RLS forçada, sem políticas: só service_role via funções SECURITY DEFINER.

create table if not exists public.user_offers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('welcome', 'personal')),
  code text not null unique,
  avulso_off_cents integer not null check (avulso_off_cents > 0),
  pack_percent integer not null check (pack_percent between 1 and 90),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  payment_id uuid references public.payments (id),
  check (expires_at > created_at)
);

create unique index if not exists user_offers_one_welcome
  on public.user_offers (profile_id) where kind = 'welcome';
create index if not exists user_offers_profile_idx
  on public.user_offers (profile_id, created_at desc);

alter table public.user_offers enable row level security;
alter table public.user_offers force row level security;
revoke all on public.user_offers from anon, authenticated;

create policy "user_offers: admin lê"
  on public.user_offers for select to authenticated
  using (public.is_admin());

-- Uso efetivo: resgatada e não liberada. Libera (volta a valer, se ainda no prazo)
-- reserva sem pagamento há > 15 min ou cujo Pix/cartão venceu sem pagar.
create or replace function public.user_offers_release_stale(p_profile_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_offers o
     set claimed_at = null, payment_id = null
   where o.profile_id = p_profile_id
     and o.claimed_at is not null
     and (
       (o.payment_id is null and o.claimed_at < now() - interval '15 minutes')
       or exists (select 1 from public.payments p where p.id = o.payment_id and p.status = 'overdue')
     );
$$;

-- Oferta corrente (a mais recente) + relógio do banco.
create or replace function public.user_offer_current(p_profile_id uuid)
returns table (
  id uuid, kind text, code text, avulso_off_cents integer, pack_percent integer,
  created_at timestamptz, expires_at timestamptz, status text, server_now timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.user_offers_release_stale(p_profile_id);
  return query
    select o.id, o.kind, o.code, o.avulso_off_cents, o.pack_percent, o.created_at, o.expires_at,
           case when o.claimed_at is not null then 'used'
                when o.expires_at <= now() then 'expired'
                else 'active' end,
           now()
      from public.user_offers o
     where o.profile_id = p_profile_id
     order by o.created_at desc
     limit 1;
end;
$$;

-- 1º acesso logado: inicia a boas-vindas (idempotente; nunca reinicia).
create or replace function public.user_offer_start_welcome(p_profile_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_offers (profile_id, kind, code, avulso_off_cents, pack_percent, expires_at)
  values (p_profile_id, 'welcome',
          'BOASVINDAS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
          4000, 30, now() + interval '48 hours')
  on conflict (profile_id) where kind = 'welcome' do nothing;
$$;

-- "Quer cupom?": devolve a ativa, ou emite (boas-vindas na 1ª vez; depois pessoal
-- respeitando o intervalo). status: active | created | cooldown. next_at = quando pode pedir.
create or replace function public.user_offer_request(p_profile_id uuid, p_cooldown_days integer)
returns table (status text, offer_id uuid, next_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last public.user_offers%rowtype;
  v_id uuid;
begin
  if p_cooldown_days is null or p_cooldown_days < 1 then
    raise exception 'cooldown inválido';
  end if;
  -- serializa pedidos do mesmo usuário
  perform 1 from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'perfil inexistente';
  end if;
  perform public.user_offers_release_stale(p_profile_id);

  if not exists (select 1 from public.user_offers where profile_id = p_profile_id and kind = 'welcome') then
    perform public.user_offer_start_welcome(p_profile_id);
    select o.id into v_id from public.user_offers o where o.profile_id = p_profile_id and o.kind = 'welcome';
    return query select 'created'::text, v_id, null::timestamptz;
    return;
  end if;

  select * into v_last from public.user_offers o
   where o.profile_id = p_profile_id order by o.created_at desc limit 1;

  if v_last.claimed_at is null and v_last.expires_at > now() then
    return query select 'active'::text, v_last.id, null::timestamptz;
    return;
  end if;

  if v_last.created_at > now() - make_interval(days => p_cooldown_days) then
    return query select 'cooldown'::text, null::uuid,
      v_last.created_at + make_interval(days => p_cooldown_days);
    return;
  end if;

  insert into public.user_offers (profile_id, kind, code, avulso_off_cents, pack_percent, expires_at)
  values (p_profile_id, 'personal',
          'PRAVOCE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
          2000, 20, now() + interval '48 hours')
  returning id into v_id;
  return query select 'created'::text, v_id, null::timestamptz;
end;
$$;

-- Resgate atômico no checkout (prazo validado com now() do banco).
create or replace function public.user_offer_claim(p_profile_id uuid, p_offer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.user_offers_release_stale(p_profile_id);
  update public.user_offers
     set claimed_at = now(), payment_id = null
   where id = p_offer_id and profile_id = p_profile_id
     and claimed_at is null and expires_at > now();
  return found;
end;
$$;

create or replace function public.user_offer_attach(p_offer_id uuid, p_payment_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_offers set payment_id = p_payment_id
   where id = p_offer_id and claimed_at is not null;
$$;

-- Falha ao gerar a cobrança ⇒ devolve a oferta (só se ainda sem pagamento).
create or replace function public.user_offer_release(p_offer_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_offers set claimed_at = null
   where id = p_offer_id and payment_id is null;
$$;

revoke all on function public.user_offers_release_stale(uuid) from public, anon, authenticated;
revoke all on function public.user_offer_current(uuid) from public, anon, authenticated;
revoke all on function public.user_offer_start_welcome(uuid) from public, anon, authenticated;
revoke all on function public.user_offer_request(uuid, integer) from public, anon, authenticated;
revoke all on function public.user_offer_claim(uuid, uuid) from public, anon, authenticated;
revoke all on function public.user_offer_attach(uuid, uuid) from public, anon, authenticated;
revoke all on function public.user_offer_release(uuid) from public, anon, authenticated;
grant execute on function public.user_offer_current(uuid) to service_role;
grant execute on function public.user_offer_start_welcome(uuid) to service_role;
grant execute on function public.user_offer_request(uuid, integer) to service_role;
grant execute on function public.user_offer_claim(uuid, uuid) to service_role;
grant execute on function public.user_offer_attach(uuid, uuid) to service_role;
grant execute on function public.user_offer_release(uuid) to service_role;
