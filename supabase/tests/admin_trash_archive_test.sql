-- 0076: arquivo morto de custos e anonimização irreversível de fornecedores.
begin;
select plan(14);

select has_column('public', 'cost_entries', 'archived_at', 'cost_entries.archived_at');
select has_column('public', 'suppliers', 'anonymized_at', 'suppliers.anonymized_at');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_cost_archive(timestamptz)', 'execute'), 'authenticated não expurga o arquivo');
select ok(not has_function_privilege('anon', 'public.purge_expired_cost_archive(timestamptz)', 'execute'), 'anon não expurga o arquivo');
select ok(has_function_privilege('service_role', 'public.purge_expired_cost_archive(timestamptz)', 'execute'), 'service_role expurga o arquivo');

insert into public.cost_entries (id, occurred_at, provider, kind, reason, quantity, unit_price_micro_usd, cost_micro_usd, fx_brl_per_usd_micro, cost_brl_cents, deleted_at)
values
  ('00000000-0000-4000-8000-00000000c001', '2027-01-10', 'vps', 'fixed', 'teste', 1, 0, 0, 5000000, 100, '2027-02-01'),
  ('00000000-0000-4000-8000-00000000c002', '2027-01-10', 'vps', 'fixed', 'teste', 1, 0, 0, 5000000, 200, null);

-- arquivar só vale para item na lixeira
select throws_ok($$ update public.cost_entries set archived_at = now() where id = '00000000-0000-4000-8000-00000000c002' $$,
  '23514', null, 'custo fora da lixeira não pode ser arquivado');
update public.cost_entries set archived_at = '2027-02-02' where id = '00000000-0000-4000-8000-00000000c001';
select throws_ok($$ update public.cost_entries set deleted_at = null where id = '00000000-0000-4000-8000-00000000c001' $$,
  '42501', null, 'custo arquivado não pode ser restaurado');
select throws_ok($$ update public.cost_entries set cost_brl_cents = 1 where id = '00000000-0000-4000-8000-00000000c001' $$,
  '42501', null, 'custo arquivado é somente leitura');

select is(public.purge_expired_cost_archive('2032-02-01'::timestamptz), 0, 'antes de 5 anos nada é expurgado');
select is(public.purge_expired_cost_archive('2032-02-02'::timestamptz), 1, 'após 5 anos o custo arquivado é expurgado');
select is((select count(*)::int from public.cost_entries where id = '00000000-0000-4000-8000-00000000c002'), 1, 'custo ativo nunca é expurgado');

insert into public.suppliers (id, name, category, source_url, source_provider, phone_e164, contact_email, deleted_at)
values ('00000000-0000-4000-8000-00000000f001', 'Buffet Teste', 'buffet', 'https://s', 'osm', '+5512999990001', 'a@b.c', '2027-02-01');
update public.suppliers set name = 'Fornecedor removido', phone_e164 = null, contact_email = null, website_url = null,
  external_id = null, source_url = 'removido', anonymized_at = now()
 where id = '00000000-0000-4000-8000-00000000f001';
select throws_ok($$ update public.suppliers set deleted_at = null where id = '00000000-0000-4000-8000-00000000f001' $$,
  '42501', null, 'fornecedor anonimizado não pode ser restaurado');
select throws_ok($$ update public.suppliers set phone_e164 = '+5512999990001' where id = '00000000-0000-4000-8000-00000000f001' $$,
  '42501', null, 'fornecedor anonimizado não pode ser reidentificado');
select lives_ok($$ update public.suppliers set status = 'cotou' where id = '00000000-0000-4000-8000-00000000f001' $$,
  'status do fornecedor anonimizado ainda pode mudar (fluxos do histórico)');

select * from finish();
rollback;
