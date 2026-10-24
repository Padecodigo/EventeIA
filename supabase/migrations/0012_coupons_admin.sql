-- Gestão de cupons pela tela admin: admins leem o catálogo (RLS default-deny mantida;
-- anon/authenticated comum continuam SEM acesso — códigos não são enumeráveis).

create policy "coupons: admin lê"
  on public.coupons for select to authenticated
  using (public.is_admin());
