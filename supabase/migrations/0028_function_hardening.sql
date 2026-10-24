-- 0028: endurecimento apontado pelo Supabase Security Advisor.
-- 1) search_path fixo nas funções de trigger SECURITY INVOKER (lint 0011).
-- 2) SECURITY DEFINER no schema exposto: EXECUTE só para quem precisa (lints 0028/0029).
--    * is_admin / is_workspace_member / can_edit_workspace: usadas em políticas RLS
--      de "authenticated" ⇒ mantêm EXECUTE para authenticated; anon/PUBLIC perdem.
--    * Funções de trigger (activate_event_on_ticket_active, register_coupon_redemption)
--      e rls_auto_enable: o Postgres não checa EXECUTE ao disparar trigger ⇒ ninguém
--      via API precisa chamá-las.
--    Nenhum dado é alterado.

alter function public.set_updated_at() set search_path = public;
alter function public.credit_ledger_guard() set search_path = public;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_workspace_member(uuid) from public, anon;
revoke execute on function public.can_edit_workspace(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.can_edit_workspace(uuid) to authenticated, service_role;

revoke execute on function public.activate_event_on_ticket_active() from public, anon, authenticated;
revoke execute on function public.register_coupon_redemption() from public, anon, authenticated;
grant execute on function public.activate_event_on_ticket_active() to service_role;
grant execute on function public.register_coupon_redemption() to service_role;

-- rls_auto_enable é criada pelo painel do Supabase (não existe em ambientes locais/CI).
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
    grant execute on function public.rls_auto_enable() to service_role;
  end if;
end $$;
