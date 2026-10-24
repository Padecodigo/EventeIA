-- EventeIA — depoimentos reais: convites + moderação (ver .context/DESIGN_SYSTEM.md §10)
-- Fluxo: convite pós-evento → formulário público com consentimento → aprovação → publicação.

create table public.testimonial_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index testimonial_invites_event_idx on public.testimonial_invites (event_id, created_at desc);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid unique references public.testimonial_invites (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  author_name text not null,
  city text,
  event_context text,
  audience text not null default 'b2c' check (audience in ('b2c', 'b2b')),
  quote text not null,
  outcome text,
  consent_given boolean not null,
  consent_text_version text not null,
  consent_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint testimonials_consent_required check (consent_given = true)
);

create index testimonials_published_idx on public.testimonials (published, published_at desc);
create index testimonials_status_idx on public.testimonials (status, created_at desc);

-- Default deny; convites só via service_role.
alter table public.testimonial_invites enable row level security;
alter table public.testimonial_invites force row level security;

alter table public.testimonials enable row level security;
alter table public.testimonials force row level security;

-- Leitura pública apenas do que foi aprovado e publicado.
create policy "testimonials: leitura pública"
  on public.testimonials for select to anon, authenticated
  using (published = true and status = 'approved');

-- Escrita: somente service_role (actions/scripts), nunca do client.
grant select on public.testimonials to anon, authenticated;
grant all on public.testimonials to service_role;
grant all on public.testimonial_invites to service_role;
