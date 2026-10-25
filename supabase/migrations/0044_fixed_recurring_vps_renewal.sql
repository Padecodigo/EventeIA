-- 0044: custos fixos recorrentes ("repete todo mês") e vencimento/valor mensal da VPS.
-- ADITIVA: só colunas novas com default seguro. Nada é apagado nem reescrito.
-- RLS: inalterada. cost_entries: insert só admin (0020) e update só admin + kind='fixed' (0039);
-- provider_balances: leitura/insert/update só admin (0039).

alter table public.cost_entries add column if not exists recurring boolean not null default false;
comment on column public.cost_entries.recurring is
  'true = custo fixo que se repete todo mês; o cheque diário lança a cópia do mês corrente se ainda não existir.';
grant update (recurring) on public.cost_entries to authenticated;

alter table public.provider_balances add column if not exists renewal_date date;
alter table public.provider_balances add column if not exists monthly_cost_brl_cents bigint
  check (monthly_cost_brl_cents is null or monthly_cost_brl_cents >= 0);
comment on column public.provider_balances.renewal_date is 'Próximo vencimento/renovação (ex.: VPS). Informado pelo admin.';
comment on column public.provider_balances.monthly_cost_brl_cents is 'Valor mensal do plano (ex.: VPS). Nulo = padrão do painel (R$ 100).';
