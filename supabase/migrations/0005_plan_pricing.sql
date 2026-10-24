-- Reprecificação Out/2026 — piso de 35% de margem de contribuição.
-- Premissas: custo R$ 9/evento, Simples 6%, Pix R$ 1,99/fatura, cartão 2,99% + R$ 0,49.
-- Fonte da verdade: .context/COMMERCIAL_MODEL.md §3.2 e §3.4.
-- A regressão é bloqueada por tests/unit/pricing.test.ts no CI.

insert into public.plans (code, name, price_cents, monthly_credits, active)
values
  ('essencial', 'Essencial', 9700, 5, true),
  ('atelier', 'Atelier', 19700, 12, true),
  ('maison', 'Maison', 39700, 24, true)
on conflict (code) do update
  set name = excluded.name,
      price_cents = excluded.price_cents,
      monthly_credits = excluded.monthly_credits,
      active = excluded.active;
