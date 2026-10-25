-- 0042: custo por evento no painel /admin/custos (ADITIVA; nada é apagado nem reescrito).
-- Marca se o valor de um custo é ESTIMADO (contagem de chamadas × preço de tabela) ou REAL (fatura/API).
-- Nulo = legado: o painel infere (variáveis medidas por chamada = estimadas; fixos = reais).
-- RLS: inalterada. cost_entries segue com leitura/insert só para is_admin() e escrita do sistema via service_role.
-- A coluna NÃO entra no grant de UPDATE de 0039 (admin corrige só valores de custos fixos).

alter table public.cost_entries add column if not exists is_estimate boolean;

comment on column public.cost_entries.is_estimate is
  'true = valor estimado (chamadas × preço de referência); false = valor real; null = legado (inferido no painel).';

-- Consulta por evento do painel (evento → custos em ordem cronológica).
create index if not exists cost_entries_event_occurred_idx
  on public.cost_entries (event_id, occurred_at desc) where event_id is not null;

-- ---------------------------------------------------------------------------
-- Exclusão RECUPERÁVEL (soft delete) no painel /admin/custos:
-- custos fixos lançados (cost_entries kind = 'fixed') e histórico de alertas (finance_alerts).
-- Nada é apagado de verdade: só marca deleted_at/deleted_by. Para recuperar: deleted_at = null.
-- Custos variáveis, eventos, pagamentos e dados de clientes NÃO ganham exclusão.
-- ---------------------------------------------------------------------------
alter table public.cost_entries add column if not exists deleted_at timestamptz;
alter table public.cost_entries add column if not exists deleted_by uuid references public.profiles (id);
alter table public.finance_alerts add column if not exists deleted_at timestamptz;
alter table public.finance_alerts add column if not exists deleted_by uuid references public.profiles (id);

create index if not exists cost_entries_deleted_by_idx on public.cost_entries (deleted_by) where deleted_by is not null;
create index if not exists finance_alerts_deleted_by_idx on public.finance_alerts (deleted_by) where deleted_by is not null;

-- cost_entries: a política "cost_entries_admin_update_fixed" (0039) já restringe UPDATE a admin + kind = 'fixed'.
-- Só ampliamos o grant de COLUNAS para as marcas de exclusão.
grant update (deleted_at, deleted_by) on public.cost_entries to authenticated;

-- finance_alerts: admin pode apenas marcar/desmarcar exclusão (sem insert/delete para authenticated).
drop policy if exists "finance_alerts_admin_soft_delete" on public.finance_alerts;
create policy "finance_alerts_admin_soft_delete" on public.finance_alerts
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
grant update (deleted_at, deleted_by) on public.finance_alerts to authenticated;
