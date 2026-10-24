-- EventeIA — seed local (NUNCA executar em produção)
-- Planos do modelo comercial (ver .context/COMMERCIAL_MODEL.md §3.2).
-- Preços calibrados com piso de 35% de margem (custo R$ 9/evento — §3.4).

insert into public.plans (code, name, price_cents, monthly_credits, active)
values
  ('essencial', 'Essencial', 11700, 3, true),
  ('atelier',   'Atelier',   19700, 7, true),
  ('maison',    'Maison',    39700, 17, true)
on conflict (code) do update
  set name = excluded.name,
      price_cents = excluded.price_cents,
      monthly_credits = excluded.monthly_credits,
      active = excluded.active;

-- Cupom de demonstração (ver .context/COMMERCIAL_MODEL.md §2.4)
insert into public.coupons (code, description, discount_type, value, active, max_redemptions)
values ('BEMVINDA10', '10% no tíquete do primeiro evento', 'percent', 10, true, 500)
on conflict (code) do update
  set description = excluded.description,
      discount_type = excluded.discount_type,
      value = excluded.value,
      active = excluded.active,
      max_redemptions = excluded.max_redemptions;
