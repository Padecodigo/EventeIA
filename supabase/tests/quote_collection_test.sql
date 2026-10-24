-- pgTAP: fase 3 (0019) — colunas aditivas e unicidade por fornecedor.
begin;
create extension if not exists pgtap;
select plan(5);
select has_column('public', 'quotations', 'confidence', 'quotations.confidence existe');
select has_column('public', 'quotations', 'extraction', 'quotations.extraction existe');
select has_column('public', 'events', 'quotes_delivered_at', 'events.quotes_delivered_at existe');
select has_index('public', 'quotations', 'quotations_event_prospect_uidx', 'um rascunho por fornecedor/evento');
select throws_ok($$ select 1 from (select 1.5::numeric(3,2) as c) x where false;
  insert into public.quotations (event_id, category, vendor_name, amount_cents, engine_version, confidence)
  values (gen_random_uuid(), 'buffet', 'X', 1, 'v1', 1.5) $$, '23514', null, 'confiança fora de 0..1 é rejeitada');
select * from finish();
rollback;
