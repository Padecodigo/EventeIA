-- 0049 — Escolhas do fornecedor (opções/pacotes com preço).
-- O usuário escolhe UMA opção por cotação; o snapshot congela o que foi
-- escolhido (nome/inclusos/preço) mesmo que a extração mude depois.

create table public.quotation_choices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  quotation_id uuid not null unique references public.quotations(id),
  option_index integer not null check (option_index >= 0 and option_index < 15),
  option_snapshot jsonb not null,
  chosen_by_profile_id uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotation_choices_event_idx on public.quotation_choices (event_id);

alter table public.quotation_choices enable row level security;
alter table public.quotation_choices force row level security;

create policy "quotation_choices: leitura via evento"
  on public.quotation_choices for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = quotation_choices.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    )
  );

create policy "quotation_choices: escrita via evento editável"
  on public.quotation_choices for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = quotation_choices.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id))
        )
    )
  );

create policy "quotation_choices: atualização via evento editável"
  on public.quotation_choices for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = quotation_choices.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = quotation_choices.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id))
        )
    )
  );

grant select, insert, update on public.quotation_choices to authenticated;
grant all on public.quotation_choices to service_role;
revoke all on public.quotation_choices from anon;
