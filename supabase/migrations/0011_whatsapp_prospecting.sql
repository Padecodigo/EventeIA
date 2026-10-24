-- Agente Orçamentista: prospecção de fornecedores via WhatsApp (Evolution).
-- Fonte da verdade: .context/WHATSAPP_EVOLUTION.md § "Agente Orçamentista".

-- Instância WhatsApp conectada pelo próprio cliente (uma por usuário).
-- credentials_encrypted: AES-256-GCM (base64) do JSON de credenciais/token da
-- instância Evolution — gravado e lido APENAS no servidor (ver lib/crypto/aes.ts).
create table public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  instance_name text not null unique,
  status text not null default 'connecting'
    check (status in ('connecting', 'connected', 'disconnected', 'paused')),
  credentials_encrypted text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_instances enable row level security;
alter table public.whatsapp_instances force row level security;

create policy "instances: dono lê"
  on public.whatsapp_instances for select to authenticated
  using (profile_id = auth.uid());

create policy "instances: admin lê"
  on public.whatsapp_instances for select to authenticated
  using (public.is_admin());

-- Fornecedores a prospectar por evento (Agente Orçamentista).
create table public.vendor_prospects (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  workspace_id uuid references public.workspaces (id),
  vendor_name text not null,
  vendor_category text not null default 'outro',
  phone_e164 text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'replied', 'opt_out', 'failed')),
  last_message_at timestamptz,
  opt_out_at timestamptz,
  created_at timestamptz not null default now()
);

create index vendor_prospects_event_idx on public.vendor_prospects (event_id, created_at desc);
-- Lookup rápido no opt-out de respostas inbound.
create index vendor_prospects_phone_idx on public.vendor_prospects (phone_e164);

alter table public.vendor_prospects enable row level security;
alter table public.vendor_prospects force row level security;

create policy "prospects: acesso via evento"
  on public.vendor_prospects for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = vendor_prospects.event_id
        and (
          e.owner_profile_id = auth.uid()
          or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))
        )
    )
  );

-- Escrita: somente service_role (actions/workers).
