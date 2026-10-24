-- 0015: entrevista do evento (catálogo v1) — aditiva.
-- Cidade do evento, respostas da entrevista e requisitos (itens a cotar).

alter table public.events
  add column if not exists city text
    check (city is null or char_length(city) between 2 and 80),
  add column if not exists interview_answers jsonb,
  add column if not exists interview_completed_at timestamptz;

create table if not exists public.event_requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  catalog_version text not null,
  category text not null,
  item_code text not null,
  label text not null,
  unit text not null check (unit in ('por_pessoa', 'por_hora', 'unidade', 'pacote')),
  quantity integer not null check (quantity > 0 and quantity <= 100000),
  mandatory boolean not null default false,
  -- Texto livre da pergunta aberta final (item 'demanda_especifica', categoria 'outros').
  notes text check (notes is null or char_length(notes) <= 500),
  -- Sem DELETE: itens que saem da entrevista ficam selected = false (histórico preservado).
  selected boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, item_code)
);

create index if not exists event_requirements_event_idx
  on public.event_requirements (event_id) where selected;

alter table public.event_requirements enable row level security;
alter table public.event_requirements force row level security;

create policy "requirements: leitura via evento"
  on public.event_requirements for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_requirements.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    )
  );

create policy "requirements: dono/planner cria"
  on public.event_requirements for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_requirements.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id))
        )
    )
  );

create policy "requirements: dono/planner edita"
  on public.event_requirements for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_requirements.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_requirements.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id))
        )
    )
  );

grant select, insert, update on public.event_requirements to authenticated;
