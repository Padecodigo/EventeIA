-- pgTAP: endurecimento de funções (0028).
begin;
create extension if not exists pgtap;
select plan(12);
select ok((select proconfig::text like '%search_path=public%' from pg_proc where oid = 'public.set_updated_at()'::regprocedure), 'set_updated_at com search_path fixo');
select ok((select proconfig::text like '%search_path=public%' from pg_proc where oid = 'public.credit_ledger_guard()'::regprocedure), 'credit_ledger_guard com search_path fixo');
select ok(not has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'), 'anon não executa is_admin');
select ok(not has_function_privilege('anon', 'public.is_workspace_member(uuid)', 'EXECUTE'), 'anon não executa is_workspace_member');
select ok(not has_function_privilege('anon', 'public.can_edit_workspace(uuid)', 'EXECUTE'), 'anon não executa can_edit_workspace');
select ok(has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE'), 'authenticated executa is_admin (RLS)');
select ok(has_function_privilege('authenticated', 'public.is_workspace_member(uuid)', 'EXECUTE'), 'authenticated executa is_workspace_member (RLS)');
select ok(has_function_privilege('authenticated', 'public.can_edit_workspace(uuid)', 'EXECUTE'), 'authenticated executa can_edit_workspace (RLS)');
select ok(not has_function_privilege('authenticated', 'public.register_coupon_redemption()', 'EXECUTE'), 'trigger de cupom não exposto');
select ok(not has_function_privilege('anon', 'public.activate_event_on_ticket_active()', 'EXECUTE'), 'trigger de ativação não exposto');
-- Regressão: RLS que chama is_admin continua funcionando para usuário logado.
select set_config('request.jwt.claims', json_build_object('sub', '51111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$ select count(*) from public.llm_usage_events $$, 'authenticated consulta tabela com política is_admin');
select is((select public.is_admin()), false, 'is_admin falso para usuário comum');
reset role;
select * from finish();
rollback;
