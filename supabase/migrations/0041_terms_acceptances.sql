-- Registro do aceite dos Termos de Uso / Política de Privacidade (LGPD: prova do aceite).
-- Append-only: gravação só pelo servidor (service_role); o titular lê apenas os próprios registros.
create table public.terms_acceptances (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  terms_version text not null check (length(terms_version) between 1 and 32),
  context text not null check (context in ('signup', 'checkout')),
  accepted_at timestamptz not null default now()
);

create index terms_acceptances_profile_id_idx on public.terms_acceptances (profile_id);

alter table public.terms_acceptances enable row level security;

revoke all on table public.terms_acceptances from anon, authenticated;
grant select on table public.terms_acceptances to authenticated;

create policy terms_acceptances_select_own
  on public.terms_acceptances
  for select
  to authenticated
  using ((select auth.uid()) = profile_id);
