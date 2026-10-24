-- 0019 — Fase 3: coleta de cotações via WhatsApp (inbound → extração → rascunho).
-- ADITIVA: só colunas novas (nullable/default) e índices. Nada é removido ou reescrito.

alter table public.quotations
  add column if not exists prospect_id uuid references public.vendor_prospects (id) on delete set null,
  add column if not exists supplier_id uuid references public.suppliers (id) on delete set null,
  add column if not exists raw_text text check (raw_text is null or char_length(raw_text) <= 8000),
  add column if not exists extraction jsonb,
  add column if not exists confidence numeric(3, 2) check (confidence is null or confidence between 0 and 1),
  add column if not exists extraction_provider text
    check (extraction_provider is null or extraction_provider in ('deepseek', 'nim', 'grok', 'contingency')),
  add column if not exists fees_cents bigint not null default 0 check (fees_cents >= 0),
  add column if not exists needs_followup boolean not null default false,
  add column if not exists followup_count integer not null default 0 check (followup_count between 0 and 10),
  add column if not exists updated_at timestamptz not null default now();

-- Um rascunho por fornecedor contatado no evento (novas mensagens atualizam o mesmo).
create unique index if not exists quotations_event_prospect_uidx
  on public.quotations (event_id, prospect_id) where prospect_id is not null;

alter table public.whatsapp_messages
  add column if not exists prospect_id uuid references public.vendor_prospects (id) on delete set null;

create index if not exists whatsapp_messages_prospect_idx
  on public.whatsapp_messages (prospect_id, created_at) where prospect_id is not null;

alter table public.events
  add column if not exists collection_ended_at timestamptz,
  add column if not exists quotes_delivered_at timestamptz;
