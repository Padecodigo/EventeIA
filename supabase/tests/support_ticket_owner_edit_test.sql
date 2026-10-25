-- pgTAP (0047): dono edita/exclui só os próprios chamados; outra pessoa não; excluído some para o dono.
begin;
create extension if not exists pgtap;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-oe@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('b5555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana-oe@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('c6666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bia-oe@teste.com', crypt('x-senha-segura', gen_salt('bf')), now(), '{}', '{}', now(), now());
update public.profiles set role = 'admin' where id = 'a4444444-4444-4444-8444-444444444444';

insert into public.support_tickets (id, user_id, type, subject, message)
values
  ('33333333-0000-4000-8000-000000000001', 'b5555555-5555-4555-8555-555555555555', 'problema', 'Erro da Ana', 'Descrição original do problema.'),
  ('33333333-0000-4000-8000-000000000002', 'b5555555-5555-4555-8555-555555555555', 'sugestao', 'Ideia da Ana', 'Outra descrição qualquer aqui.'),
  ('33333333-0000-4000-8000-000000000003', 'b5555555-5555-4555-8555-555555555555', 'sugestao', 'Fechado da Ana', 'Chamado que já foi encerrado.');
update public.support_tickets set status = 'fechado' where id = '33333333-0000-4000-8000-000000000003';

-- Bia (outra usuária) não edita nem exclui o chamado da Ana
select set_config('request.jwt.claims', json_build_object('sub', 'c6666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);
set local role authenticated;
select is(public.support_ticket_owner_edit('33333333-0000-4000-8000-000000000001', 'Invasão', 'Tentando editar o chamado alheio'), false, 'Outra usuária não edita');
select is(public.support_ticket_owner_delete('33333333-0000-4000-8000-000000000001'), false, 'Outra usuária não exclui');
update public.support_tickets set subject = 'Direto' where id = '33333333-0000-4000-8000-000000000001';
reset role;
select is((select subject || '|' || (deleted_at is null)::text from public.support_tickets where id = '33333333-0000-4000-8000-000000000001'), 'Erro da Ana|true', 'Chamado da Ana intacto');

-- Ana edita e exclui os próprios
select set_config('request.jwt.claims', json_build_object('sub', 'b5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
set local role authenticated;
select is(public.support_ticket_owner_edit('33333333-0000-4000-8000-000000000001', 'Erro corrigido', 'Descrição nova e mais completa.'), true, 'Dona edita');
select throws_ok($$ select public.support_ticket_owner_edit('33333333-0000-4000-8000-000000000001', 'x', 'curta') $$, '22023', null, 'Valida tamanhos');
select is(public.support_ticket_owner_edit('33333333-0000-4000-8000-000000000003', 'Mudando fechado', 'Não pode editar chamado fechado.'), false, 'Fechado não edita');
select is(public.support_ticket_owner_delete('33333333-0000-4000-8000-000000000002'), true, 'Dona exclui');
select is((select count(*) from public.support_tickets where id = '33333333-0000-4000-8000-000000000002'), 0::bigint, 'Excluído some para a dona');
select is((select count(*) from public.support_tickets), 2::bigint, 'Dona vê só os não excluídos');
select is(public.support_ticket_owner_edit('33333333-0000-4000-8000-000000000002', 'Editar excluído', 'Não pode editar chamado excluído.'), false, 'Excluído não edita');
select is((select count(*) from public.support_ticket_edits), 0::bigint, 'Dona não lê histórico (só admin)');
reset role;
select is((select subject || '|' || (edited_at is not null)::text from public.support_tickets where id = '33333333-0000-4000-8000-000000000001'), 'Erro corrigido|true', 'Edição gravada com edited_at');
select is((select old_subject from public.support_ticket_edits where ticket_id = '33333333-0000-4000-8000-000000000001'), 'Erro da Ana', 'Histórico guarda texto anterior');

-- Admin continua vendo o excluído (Lixeira)
select set_config('request.jwt.claims', json_build_object('sub', 'a4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select deleted_by::text from public.support_tickets where id = '33333333-0000-4000-8000-000000000002'), 'b5555555-5555-4555-8555-555555555555', 'Admin vê o excluído e quem excluiu');
reset role;

select * from finish();
rollback;
