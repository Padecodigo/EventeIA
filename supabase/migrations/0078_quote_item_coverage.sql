-- 0078 — Cobertura de itens por cotação (loop de esclarecimento IG/FB), aditiva.
--
-- Para cada cotação coletada na DM (prospect_quotes), guarda item a item o que o
-- preço inclui: included | excluded | optional_extra | unknown. O agente pergunta
-- os itens unknown/baixa confiança no máximo 2 rodadas, sempre como resposta
-- dentro da janela de 24h da Meta (Instagram/Messenger; WhatsApp não é usado).
--
-- Forward-only, aditiva: só cria tabela nova. RLS: admin lê; escrita só service_role.

create table if not exists public.quote_item_coverage (
  id uuid primary key default gen_random_uuid(),
  prospect_quote_id uuid not null references public.prospect_quotes (id) on delete cascade,
  conversation_id uuid not null references public.prospect_conversations (id) on delete cascade,
  item_code text not null check (item_code ~ '^[a-z_]{2,40}$'),
  coverage text not null default 'unknown'
    check (coverage in ('included', 'excluded', 'optional_extra', 'unknown')),
  extra_price_cents bigint check (extra_price_cents is null or extra_price_cents >= 0),
  quantity_covered integer check (quantity_covered is null or quantity_covered >= 0),
  evidence text check (evidence is null or char_length(evidence) <= 500),
  source text not null default 'ai_extracted'
    check (source in ('ai_extracted', 'supplier_confirmed', 'admin')),
  confidence numeric(3, 2) not null default 0 check (confidence between 0 and 1),
  rounds_asked smallint not null default 0 check (rounds_asked between 0 and 2),
  asked_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prospect_quote_id, item_code)
);

comment on table public.quote_item_coverage is
  'Cobertura item a item das cotações da DM (máx. 2 rodadas de pergunta).';

create index if not exists quote_item_coverage_conversation_idx
  on public.quote_item_coverage (conversation_id, created_at desc);

alter table public.quote_item_coverage enable row level security;
alter table public.quote_item_coverage force row level security;

create policy "quote_item_coverage: admin lê"
  on public.quote_item_coverage for select to authenticated
  using (public.is_admin());

revoke all on public.quote_item_coverage from anon;
revoke insert, update, delete on public.quote_item_coverage from authenticated;
