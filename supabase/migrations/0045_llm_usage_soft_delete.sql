-- 0045: exclusão RECUPERÁVEL das linhas de custo de IA (llm_usage_events) no "Detalhamento" do Financeiro.
-- ADITIVA: só colunas/índices novos. Nada é apagado. Para recuperar: deleted_at = null.
-- RLS: inalterada (leitura só admin). A marcação é feita pelo servidor (service_role) DEPOIS de requireAdmin();
-- nenhum grant novo para authenticated/anon.
alter table public.llm_usage_events add column if not exists deleted_at timestamptz;
alter table public.llm_usage_events add column if not exists deleted_by uuid references public.profiles (id) on delete set null;
create index if not exists llm_usage_events_deleted_by_idx on public.llm_usage_events (deleted_by) where deleted_by is not null;
create index if not exists llm_usage_events_active_created_idx on public.llm_usage_events (created_at desc) where deleted_at is null;
