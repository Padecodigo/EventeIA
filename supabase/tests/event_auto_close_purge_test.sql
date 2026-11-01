-- pgTAP: 0080 — encerramento automático/manual e exclusões (P2).
begin;
create extension if not exists pgtap;
select plan(16);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a0800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dono-p2@teste.com',
   crypt('senha-super-segura', gen_salt('bf')), now(), '{}'::jsonb, '{"full_name":"Dono P2"}'::jsonb, now(), now());

insert into public.events (id, owner_profile_id, title, event_type, event_date, region_code, guest_count)
values
  ('a0801111-0000-4000-8000-000000000001', 'a0800000-0000-4000-8000-000000000001', 'Pronto', 'aniversario', '2026-12-20', 'sp', 50),
  ('a0801111-0000-4000-8000-000000000002', 'a0800000-0000-4000-8000-000000000001', 'Falta bolo', 'aniversario', '2026-12-21', 'sp', 50);
update public.events set status = 'active', interview_answers = '{"q":"a"}'::jsonb
 where id in ('a0801111-0000-4000-8000-000000000001', 'a0801111-0000-4000-8000-000000000002');

insert into public.suppliers (id, name, category, source_url, source_provider) values
  ('a0802222-0000-4000-8000-000000000001', 'Buffet P2', 'buffet', 'https://exemplo.com.br', 'mock'),
  ('a0802222-0000-4000-8000-000000000002', 'Bolo P2', 'bolo_doces', 'https://exemplo.com.br', 'mock');

insert into public.event_requirements (event_id, catalog_version, category, item_code, label, unit, quantity, mandatory)
values
  ('a0801111-0000-4000-8000-000000000001', 'v1', 'buffet', 'buffet_x', 'Buffet', 'por_pessoa', 50, true),
  ('a0801111-0000-4000-8000-000000000002', 'v1', 'buffet', 'buffet_x', 'Buffet', 'por_pessoa', 50, true),
  ('a0801111-0000-4000-8000-000000000002', 'v1', 'bolo_doces', 'bolo_x', 'Bolo', 'unidade', 1, true);

insert into public.supplier_selections (event_id, supplier_id, status) values
  ('a0801111-0000-4000-8000-000000000001', 'a0802222-0000-4000-8000-000000000001', 'respondido'),
  ('a0801111-0000-4000-8000-000000000002', 'a0802222-0000-4000-8000-000000000001', 'respondido'),
  ('a0801111-0000-4000-8000-000000000002', 'a0802222-0000-4000-8000-000000000002', 'aguardando_resposta');

insert into public.supplier_conversations (id, event_id, supplier_id, channel, external_user_id)
values ('a0803333-0000-4000-8000-000000000001', 'a0801111-0000-4000-8000-000000000001', 'a0802222-0000-4000-8000-000000000001', 'instagram', 'igsid-p2');
insert into public.supplier_conversation_messages (conversation_id, direction, body)
values ('a0803333-0000-4000-8000-000000000001', 'in', 'orçamento');
insert into public.budget_snapshots (event_id, engine_version, total_cents, breakdown)
values ('a0801111-0000-4000-8000-000000000001', 'v1', 100000, '{}'::jsonb);

select is(public.event_ready_to_close('a0801111-0000-4000-8000-000000000001'), true, 'todas as categorias com escolha respondida');
select is(public.event_ready_to_close('a0801111-0000-4000-8000-000000000002'), false, 'categoria sem resposta não encerra');

select is((select count(*)::int from public.auto_close_ready_events()), 1, 'varredura encerra só o pronto');
select is((select status from public.events where id = 'a0801111-0000-4000-8000-000000000001'), 'completed', 'status concluído');
select is((select close_reason from public.events where id = 'a0801111-0000-4000-8000-000000000001'), 'auto', 'motivo auto');
select isnt((select content_purged_at from public.events where id = 'a0801111-0000-4000-8000-000000000001'), null, 'conteúdo marcado como apagado');
select is((select interview_answers from public.events where id = 'a0801111-0000-4000-8000-000000000001'), null, 'entrevista apagada');
select is((select count(*)::int from public.supplier_conversation_messages where conversation_id = 'a0803333-0000-4000-8000-000000000001'), 0, 'mensagens apagadas');
select is((select count(*)::int from public.supplier_conversations where id = 'a0803333-0000-4000-8000-000000000001'), 1, 'conversa do fornecedor mantida');
select is((select count(*)::int from public.suppliers where id = 'a0802222-0000-4000-8000-000000000001'), 1, 'fornecedor mantido');
select is((select count(*)::int from public.supplier_selections where event_id = 'a0801111-0000-4000-8000-000000000001'), 1, 'handoff mantido até 72h após a data');

-- Encerrar manual passa pelo mesmo gatilho.
update public.events set status = 'completed' where id = 'a0801111-0000-4000-8000-000000000002';
select is((select close_reason from public.events where id = 'a0801111-0000-4000-8000-000000000002'), 'manual', 'encerrar manual');
select is((select interview_answers from public.events where id = 'a0801111-0000-4000-8000-000000000002'), null, 'manual também apaga entrevista');

-- Relatório: não sai antes de 72h após o dia do evento (20/12 → 23/12 23:59 BRT + ...).
select is(public.purge_closed_event_reports('2026-12-23T23:00:00-03'::timestamptz), 0, 'antes de 72h nada sai');
select is(public.purge_closed_event_reports('2026-12-24T00:00:00-03'::timestamptz), 1, '72h após o fim do dia do evento: expurga');
select is((select count(*)::int from public.supplier_selections where event_id = 'a0801111-0000-4000-8000-000000000001') + (select count(*)::int from public.budget_snapshots where event_id = 'a0801111-0000-4000-8000-000000000001'), 0, 'relatório e handoff apagados após 72h');

select * from finish();
rollback;
