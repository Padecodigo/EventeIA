-- 0026: contexto do consumo de LLM (estágio do processo + canal WhatsApp) e sinal de
-- "fechamento por fora" (cliente fechou direto com o fornecedor antes da proposta consolidada).
--
-- ┌─ Nota de revisão (Supabase + Security review) ───────────────────────────────┐
-- │ Migração ADITIVA: só colunas anuláveis, índices e uma tabela nova.            │
-- │   Nenhum DROP/DELETE/UPDATE de dados; código antigo continua funcionando.     │
-- │ Usuário/evento: reaproveita llm_usage_events.profile_id/event_id (0020).      │
-- │ RLS: llm_usage_events segue só leitura admin (0017). event_outcomes nasce com  │
-- │   RLS forçada: leitura/escrita apenas is_admin(); sistema grava via            │
-- │   service_role. Sem política de DELETE (não se apaga histórico).              │
-- │ PII: nenhum texto livre — só enums, timestamps e UUIDs.                       │
-- └──────────────────────────────────────────────────────────────────────────────┘

-- Estágios do processo (ver lib/usage/stages.ts — manter em sincronia).
alter table public.llm_usage_events
  add column if not exists stage text
    check (stage is null or stage in ('briefing', 'discovery', 'prospecting', 'quote_collection', 'proposal', 'confirmation')),
  add column if not exists whatsapp_channel text
    check (whatsapp_channel is null or whatsapp_channel in ('cloud', 'evolution'));

create index if not exists llm_usage_events_task_created_idx on public.llm_usage_events (task, created_at desc);
create index if not exists llm_usage_events_profile_created_idx
  on public.llm_usage_events (profile_id, created_at desc) where profile_id is not null;
create index if not exists llm_usage_events_stage_created_idx
  on public.llm_usage_events (stage, created_at desc) where stage is not null;
create index if not exists llm_usage_events_channel_created_idx
  on public.llm_usage_events (whatsapp_channel, created_at desc) where whatsapp_channel is not null;

-- Desfecho do evento fora da plataforma (1 linha por evento).
create table if not exists public.event_outcomes (
  event_id uuid primary key references public.events (id) on delete cascade,
  closed_outside boolean not null default false,
  closed_outside_at timestamptz,
  closed_outside_stage text
    check (closed_outside_stage is null or closed_outside_stage in ('briefing', 'discovery', 'prospecting', 'quote_collection', 'proposal', 'confirmation')),
  whatsapp_channel text check (whatsapp_channel is null or whatsapp_channel in ('cloud', 'evolution')),
  source text not null default 'admin' check (source in ('admin', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_outcomes_closed_consistency check (closed_outside = (closed_outside_at is not null))
);

create index if not exists event_outcomes_closed_idx
  on public.event_outcomes (closed_outside_at desc) where closed_outside;

alter table public.event_outcomes enable row level security;
alter table public.event_outcomes force row level security;

drop policy if exists "event_outcomes_admin_read" on public.event_outcomes;
create policy "event_outcomes_admin_read" on public.event_outcomes
  for select to authenticated using (public.is_admin());
drop policy if exists "event_outcomes_admin_insert" on public.event_outcomes;
create policy "event_outcomes_admin_insert" on public.event_outcomes
  for insert to authenticated with check (public.is_admin());
drop policy if exists "event_outcomes_admin_update" on public.event_outcomes;
create policy "event_outcomes_admin_update" on public.event_outcomes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
