-- Reprecificação v2 (Out/2026) — pedido comercial:
-- Essencial R$ 117 / 3 eventos · Atelier R$ 197 / 7 eventos · Maison R$ 397 / 17 eventos.
-- Piso de margem de 35% preservado (ver lib/pricing.ts e COMMERCIAL_MODEL.md §3.4).

insert into public.plans (code, name, price_cents, monthly_credits, active)
values
  ('essencial', 'Essencial', 11700, 3, true),
  ('atelier', 'Atelier', 19700, 7, true),
  ('maison', 'Maison', 39700, 17, true)
on conflict (code) do update
  set name = excluded.name,
      price_cents = excluded.price_cents,
      monthly_credits = excluded.monthly_credits,
      active = excluded.active;
