-- pgTAP: 0077 — contatos dos @ marcados nos posts de isca.
begin;
create extension if not exists pgtap;
select plan(7);

insert into public.prospect_posts (id, caption, status, tagged_handles)
values
  ('11111111-1111-4111-8111-111111111111', 'post A', 'published', array['buffet_ana','doces_bia']),
  ('22222222-2222-4222-8222-222222222222', 'post B', 'published', array['buffet_ana']);

select is(public.mark_prospect_post_contact('@Buffet_Ana '), 2, 'Normaliza @/caixa e marca em todos os posts que o marcaram');
select is(public.mark_prospect_post_contact('buffet_ana'), 0, 'Idempotente: não duplica');
select is((select contacted_handles from public.prospect_posts where id = '11111111-1111-4111-8111-111111111111'), array['buffet_ana'], 'contacted_handles do post A');
select is(public.mark_prospect_post_contact('nao_marcado'), 0, 'Handle não marcado não altera nada');
select is(public.mark_prospect_post_contact(''), 0, 'Vazio é ignorado');

update public.prospect_posts set deleted_at = now() where id = '22222222-2222-4222-8222-222222222222';
select is(public.mark_prospect_post_contact('doces_bia'), 1, 'Post já excluído não é alterado');

set local role authenticated;
select throws_ok($$ select public.mark_prospect_post_contact('x') $$, '42501', null, 'authenticated não executa a função');
reset role;

select * from finish();
rollback;
