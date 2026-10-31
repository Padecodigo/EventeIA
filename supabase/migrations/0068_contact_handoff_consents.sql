-- 0068 — Repasse de contato após escolha da cotação (aditiva).
--
-- O usuário só compartilha o próprio contato com o fornecedor depois de um
-- consentimento LGPD explícito POR FORNECEDOR. O consentimento é registrado
-- aqui com o texto exibido e o instante do aceite — sem IP (minimização de dados).
-- O status do repasse fica na mesma linha; a cotação vira `repassado` quando o
-- contato é entregue (Instagram/Messenger ou e-mail público). Nada é removido.

-- `repassado` = a EventeIA concluiu o repasse e o atendimento segue direto entre
-- o usuário e o fornecedor. As demais etapas continuam existindo.
alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations
  add constraint quotations_status_check
  check (status in ('draft', 'sent', 'confirmed', 'declined', 'expired', 'repassado'));

alter table public.quotations
  add column if not exists repassado_at timestamptz;

-- E-mail público do fornecedor (fallback quando a janela Meta está fechada).
alter table public.suppliers
  add column if not exists contact_email text;

create table if not exists public.contact_handoff_consents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Texto exibido no checkbox e versão canônica do consentimento.
  consent_text text not null check (char_length(consent_text) between 1 and 2000),
  consent_version text not null,
  accepted_at timestamptz not null default now(),
  -- consentido → repassado (Meta/e-mail) | link | indisponivel.
  delivery_status text not null default 'consentido'
    check (delivery_status in ('consentido', 'repassado', 'link', 'canal_fechado', 'indisponivel')),
  delivery_channel text
    check (delivery_channel is null or delivery_channel in ('instagram', 'messenger', 'email', 'link')),
  delivered_at timestamptz,
  fallback_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quotation_id, profile_id)
);

create index if not exists contact_handoff_consents_event_idx
  on public.contact_handoff_consents (event_id);
create index if not exists contact_handoff_consents_supplier_idx
  on public.contact_handoff_consents (supplier_id);

alter table public.contact_handoff_consents enable row level security;
alter table public.contact_handoff_consents force row level security;

-- RLS: cada pessoa só enxerga e registra as próprias linhas. O status do
-- repasse (`delivery_status`, `delivered_at`, `delivery_channel`, `fallback_url`)
-- só é alterado pelo servidor via service_role — nunca pelo usuário, que poderia
-- forjar `repassado`/`delivered_at` e o próprio texto do consentimento.
create policy "contact_handoff_consents: leitura própria"
  on public.contact_handoff_consents for select to authenticated
  using (profile_id = auth.uid());

create policy "contact_handoff_consents: inserção própria"
  on public.contact_handoff_consents for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = contact_handoff_consents.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id))
        )
    )
  );

-- Sem policy de UPDATE para authenticated: o RLS nega qualquer alteração feita
-- pelo usuário. service_role ignora RLS (BYPASSRLS) e é quem executa o repasse.
grant select, insert on public.contact_handoff_consents to authenticated;
revoke update, delete on public.contact_handoff_consents from authenticated;
grant all on public.contact_handoff_consents to service_role;
revoke all on public.contact_handoff_consents from anon;
