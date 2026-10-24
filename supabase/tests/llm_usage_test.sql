-- pgTAP: auditoria de uso de LLM (0017).
begin;
create extension if not exists pgtap;
select plan(3);
select lives_ok($$ insert into public.llm_usage_events (provider, task, input_tokens, output_tokens, cost_micro_usd, outcome)
  values ('nim', 'quotation_extraction', 1000, 200, 180, 'ok') $$, 'Registra uso do NIM');
select throws_ok($$ insert into public.llm_usage_events (provider, task, outcome) values ('openai', 'x1', 'ok') $$,
  '23514', null, 'Provedor desconhecido é rejeitado');
select set_config('request.jwt.claims', json_build_object('sub', '51111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.llm_usage_events), 0::bigint, 'Usuário comum não lê a auditoria');
reset role;
select * from finish();
rollback;
