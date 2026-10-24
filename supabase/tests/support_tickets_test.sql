-- pgTAP: central de atendimento (0027) — defaults, RLS, rate limit, thread.
begin;
create extension if not exists pgtap;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-st@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana-st@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('c3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bia-st@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now());
update public.profiles set role = 'admin' where id = 'a1111111-1111-4111-8111-111111111111';
insert into public.events (id, owner_profile_id, title, event_type, event_date, region_code, guest_count, status)
values ('e1111111-1111-4111-8111-111111111111', 'c3333333-3333-4333-8333-333333333333', 'Festa da Bia', 'aniversario', '2027-01-10', 'sp', 50, 'draft');

-- Servidor (service_role/superuser): anônimo com e-mail e defaults de prioridade
insert into public.support_tickets (id, email, type, subject, message)
values ('11111111-0000-4000-8000-000000000001', 'visitante@teste.com', 'sugestao', 'Ideia boa', 'Seria ótimo ter exportação em PDF.');
select is((select priority from public.support_tickets where id = '11111111-0000-4000-8000-000000000001'), 'normal', 'Default normal');
select is((select status from public.support_tickets where id = '11111111-0000-4000-8000-000000000001'), 'aberto', 'Status inicial aberto');
insert into public.support_tickets (id, email, type, subject, message)
values ('11111111-0000-4000-8000-000000000002', 'visitante@teste.com', 'problema', 'Erro no checkout', 'O botão de pagar não responde.');
select is((select priority from public.support_tickets where id = '11111111-0000-4000-8000-000000000002'), 'alta', 'Problema ⇒ alta');
select throws_ok($$ insert into public.support_tickets (type, subject, message) values ('elogio', 'Sem contato', 'Mensagem sem canal de resposta') $$, '23514', null, 'Exige user_id ou e-mail');
select throws_ok($$ insert into public.support_tickets (email, type, subject, message) values ('x@teste.com', 'outro', 'Tipo inválido', 'Mensagem qualquer aqui') $$, '23514', null, 'Tipo inválido rejeitado');

-- Usuária Ana (authenticated)
select set_config('request.jwt.claims', json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$ insert into public.support_tickets (id, user_id, type, subject, message, priority, status) values ('22222222-0000-4000-8000-000000000001', 'b2222222-2222-4222-8222-222222222222', 'reclamacao', 'Demorou', 'A cotação demorou demais para chegar.', 'urgente', 'resolvido') $$, 'Ana cria o próprio ticket');
select is((select priority || '/' || status from public.support_tickets where id = '22222222-0000-4000-8000-000000000001'), 'normal/aberto', 'Usuária não escolhe prioridade/status');
select throws_ok($$ insert into public.support_tickets (user_id, type, subject, message) values ('c3333333-3333-4333-8333-333333333333', 'elogio', 'Fingindo', 'Tentando criar em nome da Bia') $$, '42501', null, 'Não cria em nome de outra pessoa');
select throws_ok($$ insert into public.support_tickets (user_id, type, subject, message, event_id) values ('b2222222-2222-4222-8222-222222222222', 'problema', 'Evento alheio', 'Vinculando evento de outra pessoa', 'e1111111-1111-4111-8111-111111111111') $$, '42501', null, 'Não vincula evento alheio');
select is((select count(*) from public.support_tickets), 1::bigint, 'Ana só vê os próprios tickets');
select lives_ok($$ insert into public.support_ticket_messages (ticket_id, author_role, author_id, body) values ('22222222-0000-4000-8000-000000000001', 'user', 'b2222222-2222-4222-8222-222222222222', 'Complementando: era um casamento.') $$, 'Ana responde no próprio ticket');
select throws_ok($$ insert into public.support_ticket_messages (ticket_id, author_role, author_id, body) values ('22222222-0000-4000-8000-000000000001', 'admin', 'b2222222-2222-4222-8222-222222222222', 'Me passando por admin') $$, '42501', null, 'Usuária não escreve como admin');
select throws_ok($$ insert into public.support_ticket_messages (ticket_id, author_role, author_id, body) values ('11111111-0000-4000-8000-000000000001', 'user', 'b2222222-2222-4222-8222-222222222222', 'Ticket alheio') $$, '42501', null, 'Não responde ticket alheio');
update public.support_tickets set status = 'fechado' where id = '22222222-0000-4000-8000-000000000001';
reset role;
select is((select status from public.support_tickets where id = '22222222-0000-4000-8000-000000000001'), 'aberto', 'Usuária não altera status (sem política de update)');

-- Admin
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from public.support_tickets), 3::bigint, 'Admin vê todos');
update public.support_tickets set status = 'resolvido', priority = 'urgente' where id = '22222222-0000-4000-8000-000000000001';
select is((select status || '/' || priority from public.support_tickets where id = '22222222-0000-4000-8000-000000000001'), 'resolvido/urgente', 'Admin muda status e prioridade');
select lives_ok($$ insert into public.support_ticket_messages (ticket_id, author_role, author_id, body) values ('22222222-0000-4000-8000-000000000001', 'admin', 'a1111111-1111-4111-8111-111111111111', 'Resolvido, obrigado!') $$, 'Admin responde');
reset role;

-- Resposta do usuário reabre ticket resolvido
insert into public.support_ticket_messages (ticket_id, author_role, author_id, body)
values ('22222222-0000-4000-8000-000000000001', 'user', 'b2222222-2222-4222-8222-222222222222', 'Voltou a acontecer.');
select is((select status from public.support_tickets where id = '22222222-0000-4000-8000-000000000001'), 'aberto', 'Réplica do usuário reabre');

-- Rate limit
select is(public.support_rate_hit(repeat('a', 64), 2), 1, 'Primeiro hit');
select throws_ok($$ select public.support_rate_hit(repeat('a', 64), 1) $$, 'P0429', null, 'Acima do limite ⇒ rate_limited');

select * from finish();
rollback;
