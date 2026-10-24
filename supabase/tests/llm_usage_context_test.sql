-- pgTAP: contexto do consumo de LLM + fechamento por fora (0026).
begin;
create extension if not exists pgtap;
select plan(9);

select has_column('public', 'llm_usage_events', 'stage', 'llm_usage_events.stage existe');
select has_column('public', 'llm_usage_events', 'whatsapp_channel', 'llm_usage_events.whatsapp_channel existe');
select col_is_null('public', 'llm_usage_events', 'stage', 'stage é anulável (linhas antigas continuam válidas)');
select lives_ok($$ insert into public.llm_usage_events (provider, task, outcome, stage, whatsapp_channel)
  values ('deepseek', 'quotation_extraction', 'ok', 'quote_collection', 'evolution') $$, 'Aceita estágio e canal válidos');
select throws_ok($$ insert into public.llm_usage_events (provider, task, outcome, stage) values ('nim', 'x1', 'ok', 'outro') $$,
  '23514', null, 'Estágio desconhecido é rejeitado');
select has_index('public', 'llm_usage_events', 'llm_usage_events_task_created_idx', 'Índice por task');
select has_table('public', 'event_outcomes', 'event_outcomes existe');
select throws_ok($$ insert into public.event_outcomes (event_id, closed_outside) values (gen_random_uuid(), true) $$,
  '23514', null, 'closed_outside exige closed_outside_at');

select set_config('request.jwt.claims', json_build_object('sub', '51111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.event_outcomes), 0::bigint, 'Usuário comum não lê desfechos');
reset role;
select * from finish();
rollback;
