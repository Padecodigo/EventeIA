-- Moderação de depoimentos: admins leem todos os registros (inclusive pendentes).
-- A escrita continua restrita ao service_role (actions e CLI).
-- O público segue vendo apenas published + approved (0004).

create policy "testimonials: admin lê"
  on public.testimonials for select to authenticated
  using (public.is_admin());
