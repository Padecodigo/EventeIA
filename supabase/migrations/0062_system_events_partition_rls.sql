-- 0062 — RLS na partição default de system_events (aditiva).
--
-- A tabela-mãe system_events já tem RLS; a partição `system_events_default`
-- não tinha, então uma consulta direta na partição ignoraria as policies.
-- Consultas pela tabela-mãe não mudam; service_role continua com acesso.
-- Detectado pelo teste pgTAP rls_coverage_test.sql.

alter table public.system_events_default enable row level security;
alter table public.system_events_default force row level security;
