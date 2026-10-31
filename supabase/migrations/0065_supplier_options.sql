-- 0065 — Seleção de produtos no nível de CATEGORIA (aditiva).
--
-- Clarificação do dono (sobrescreve "sem catálogo itemizado"): cada fornecedor pode
-- oferecer VÁRIAS opções/produtos (ex.: buffet → churrasco, jantar; louça → vários
-- jogos). O registro do fornecedor guarda a categoria + a lista de opções, preenchidas
-- a partir das respostas do fornecedor no chat (o agente extrai; o admin pode editar).
--
-- - `supplier_options`: opções oferecidas por um fornecedor (nome, descrição, preço,
--   unidade, id da mensagem de origem).
-- - `supplier_selections`: a escolha do USUÁRIO (uma por fornecedor por evento) com a
--   máquina de estados pendente → enviado_ao_fornecedor → aguardando_resposta →
--   respondido | canal_fechado | indisponivel.
--
-- Nada aqui altera nem apaga dados existentes.

create table if not exists public.supplier_options (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  description text check (description is null or char_length(description) <= 300),
  price_cents bigint check (price_cents is null or price_cents >= 0),
  unit text not null default 'por_pessoa'
    check (unit in ('por_pessoa', 'por_hora', 'unidade', 'pacote')),
  -- id da mensagem do fornecedor (external_id) de onde a opção foi extraída.
  source_message_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_options_supplier_idx
  on public.supplier_options (supplier_id) where active;

-- RLS: admin escreve/edita; o dono do evento lê as opções de fornecedores ligados
-- ao seu evento (via conversa Meta, cotação ou prospecto).
alter table public.supplier_options enable row level security;
alter table public.supplier_options force row level security;

create policy "supplier_options: admin lê"
  on public.supplier_options for select to authenticated
  using (public.is_admin());

create policy "supplier_options: dono do evento lê"
  on public.supplier_options for select to authenticated
  using (
    exists (
      select 1 from public.supplier_conversations c
      join public.events e on e.id = c.event_id
      where c.supplier_id = supplier_options.supplier_id
        and c.event_id is not null
        and (e.owner_profile_id = auth.uid()
             or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id)))
    )
    or exists (
      select 1 from public.quotations q
      join public.events e on e.id = q.event_id
      where q.supplier_id = supplier_options.supplier_id
        and (e.owner_profile_id = auth.uid()
             or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id)))
    )
    or exists (
      select 1 from public.vendor_prospects v
      join public.events e on e.id = v.event_id
      where v.supplier_id = supplier_options.supplier_id
        and (e.owner_profile_id = auth.uid()
             or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id)))
    )
  );

create policy "supplier_options: admin cria"
  on public.supplier_options for insert to authenticated
  with check (public.is_admin());

create policy "supplier_options: admin atualiza"
  on public.supplier_options for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Escolha do usuário: uma por fornecedor por evento. O snapshot congela o que foi
-- escolhido (nome/descrição/preço/unidade) mesmo que a opção mude ou saia do catálogo.
create table if not exists public.supplier_selections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  option_id uuid references public.supplier_options (id) on delete set null,
  option_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviado_ao_fornecedor', 'aguardando_resposta', 'respondido', 'canal_fechado', 'indisponivel')),
  chosen_by_profile_id uuid references public.profiles (id),
  conversation_id uuid references public.supplier_conversations (id) on delete set null,
  relayed_at timestamptz,
  supplier_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, supplier_id)
);

create index if not exists supplier_selections_event_idx
  on public.supplier_selections (event_id);

alter table public.supplier_selections enable row level security;
alter table public.supplier_selections force row level security;

create policy "supplier_selections: admin lê"
  on public.supplier_selections for select to authenticated
  using (public.is_admin());

create policy "supplier_selections: dono do evento lê"
  on public.supplier_selections for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = supplier_selections.event_id
        and (e.owner_profile_id = auth.uid()
             or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id)))
    )
  );

create policy "supplier_selections: dono cria"
  on public.supplier_selections for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = supplier_selections.event_id
        and (e.owner_profile_id = auth.uid()
             or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id)))
    )
  );

create policy "supplier_selections: dono atualiza"
  on public.supplier_selections for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = supplier_selections.event_id
        and (e.owner_profile_id = auth.uid()
             or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id)))
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = supplier_selections.event_id
        and (e.owner_profile_id = auth.uid()
             or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id)))
    )
  );

grant select, insert, update on public.supplier_options to authenticated;
grant select, insert, update on public.supplier_selections to authenticated;
grant all on public.supplier_options to service_role;
grant all on public.supplier_selections to service_role;
revoke all on public.supplier_options from anon;
revoke all on public.supplier_selections from anon;
