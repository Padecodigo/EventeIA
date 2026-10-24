-- 0021 — Login com Google: e-mail no perfil para notificações ("orçamento pronto").
-- Expand-only: coluna nova anulável; código antigo segue funcionando.
-- Segurança: o e-mail é escrito SOMENTE por triggers security definer a partir
-- de auth.users (verificado pelo Supabase Auth). authenticated não recebe
-- grant de UPDATE na coluna — impede redirecionar notificações para terceiros.

alter table public.profiles add column if not exists email text;

-- Backfill dos perfis existentes.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- Perfil automático: nome do Google (full_name | name) + e-mail.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := left(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Anfitrião'
  ), 80);

  insert into public.profiles (id, display_name, email)
  values (new.id, v_name, new.email)
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Sincroniza troca de e-mail / vínculo de identidade (ex.: conta com senha
-- que passa a entrar com Google).
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id and email is distinct from new.email;
  return new;
end;
$$;

revoke all on function public.sync_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();
