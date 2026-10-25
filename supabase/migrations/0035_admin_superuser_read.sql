-- Admin = superusuário: leitura (SELECT) de todas as tabelas de domínio via public.is_admin().
-- Apenas ADICIONA políticas permissivas restritas a is_admin(); nada muda para não-admins.
do $$
declare t text;
begin
  foreach t in array array[
    'workspaces','workspace_members','events','event_requirements','event_tickets',
    'budget_snapshots','quotations','suppliers','vendor_prospects','credit_ledger',
    'subscriptions','coupon_redemptions','notifications','whatsapp_instances','whatsapp_messages',
    'supplier_discovery_runs','support_tickets','support_ticket_messages','profiles'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || ': superadmin lê', t);
      execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || ': superadmin lê', t);
    end if;
  end loop;
end $$;
