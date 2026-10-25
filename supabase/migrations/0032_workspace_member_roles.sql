-- 0032 — Planner não concede papel acima do próprio nem remove o owner.
-- Bug: a policy de insert de workspace_members só exigia can_edit_workspace
-- (owner OU planner) e não olhava member_role; um planner podia se/adicionar
-- alguém como 'owner'. A policy de delete deixava o planner remover o owner.
--
-- Revisão de segurança (Supabase):
--  * workspace_role(ws): SECURITY DEFINER (lê workspace_members sem recursão
--    de RLS), STABLE, search_path fixo, só retorna o papel de auth.uid().
--    EXECUTE só para authenticated/service_role.
--  * Papel 'owner' nunca é concedido pelo cliente (posse = workspaces.owner_id,
--    criada no servidor). owner adiciona planner/viewer; planner adiciona
--    planner/viewer; viewer nada (can_edit_workspace já barrava).
--  * Delete: planner não remove owner; ninguém remove a si mesmo (mantido).
--  * Troca de policies (drop+create) na mesma migração — sem perda de dados.
--    Não há policy de UPDATE (papéis não são alteráveis pelo cliente).

create or replace function public.workspace_role(ws uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.member_role
    from public.workspace_members m
   where m.workspace_id = ws and m.profile_id = auth.uid();
$$;

revoke all on function public.workspace_role(uuid) from public, anon;
grant execute on function public.workspace_role(uuid) to authenticated, service_role;

drop policy if exists "members: owner/planner gerem" on public.workspace_members;
create policy "members: owner/planner gerem"
  on public.workspace_members for insert to authenticated
  with check (
    public.can_edit_workspace(workspace_id)
    and member_role in ('planner', 'viewer')
  );

drop policy if exists "members: owner/planner removem" on public.workspace_members;
create policy "members: owner/planner removem"
  on public.workspace_members for delete to authenticated
  using (
    public.can_edit_workspace(workspace_id)
    and profile_id <> auth.uid()
    and (member_role <> 'owner' or public.workspace_role(workspace_id) = 'owner')
  );
