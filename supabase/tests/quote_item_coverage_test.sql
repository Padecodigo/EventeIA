-- pgTAP: 0078 — quote_item_coverage (RLS, checks, unicidade).
begin;
create extension if not exists pgtap;
select plan(8);

insert into public.prospect_conversations (id, channel, external_user_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'instagram', 'igsid-cov-1');
insert into public.prospect_quotes (id, conversation_id, product)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'buffet');

select lives_ok($$
  insert into public.quote_item_coverage (prospect_quote_id, conversation_id, item_code)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'garcons')
$$, 'service role insere cobertura');

select is((select coverage from public.quote_item_coverage where item_code = 'garcons'), 'unknown', 'default unknown');

select throws_ok($$
  insert into public.quote_item_coverage (prospect_quote_id, conversation_id, item_code)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'garcons')
$$, '23505', null, 'único por (cotação, item)');

select throws_ok($$
  update public.quote_item_coverage set rounds_asked = 3 where item_code = 'garcons'
$$, '23514', null, 'no máximo 2 rodadas');

select throws_ok($$
  update public.quote_item_coverage set coverage = 'talvez' where item_code = 'garcons'
$$, '23514', null, 'valores de cobertura restritos');

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.quote_item_coverage'::regclass),
  'RLS habilitada e forçada'
);

set local role authenticated;
select is((select count(*) from public.quote_item_coverage)::int, 0, 'não-admin não lê');
select throws_ok($$
  insert into public.quote_item_coverage (prospect_quote_id, conversation_id, item_code)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'limpeza')
$$, '42501', null, 'authenticated não escreve');
reset role;

select * from finish();
rollback;
