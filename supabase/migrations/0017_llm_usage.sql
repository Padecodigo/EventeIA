-- 0017: auditoria de uso/custo de LLM por provedor (aditiva). Sem texto de fornecedor (sem PII).
create table if not exists public.llm_usage_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('nim', 'grok', 'deepseek')),
  task text not null check (char_length(task) between 2 and 40),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  outcome text not null check (outcome in ('ok', 'invalid', 'low_confidence', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists llm_usage_events_provider_created_idx
  on public.llm_usage_events (provider, created_at desc);

alter table public.llm_usage_events enable row level security;

drop policy if exists "llm_usage_events_admin_read" on public.llm_usage_events;
create policy "llm_usage_events_admin_read" on public.llm_usage_events
  for select to authenticated using (public.is_admin());
