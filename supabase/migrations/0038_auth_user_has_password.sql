-- Diz se a conta tem senha (auth.users.encrypted_password preenchida).
-- Contas só de link mágico têm identidade "email" mas nenhuma senha; a heurística por
-- identidade mostrava "Alterar senha" para elas. Só o service_role pode chamar.
create or replace function public.auth_user_has_password(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.encrypted_password is not null and length(u.encrypted_password) > 0
       from auth.users u where u.id = p_user_id),
    false
  );
$$;

revoke all on function public.auth_user_has_password(uuid) from public, anon, authenticated;
grant execute on function public.auth_user_has_password(uuid) to service_role;
