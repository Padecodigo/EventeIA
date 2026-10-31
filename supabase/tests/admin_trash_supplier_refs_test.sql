-- Regressão (31/10): a lixeira só checava vendor_prospects; prospect_conversations travava o DELETE.
-- Garante que a lista SUPPLIER_REFERENCING_TABLES (lib/admin/trash.ts) cobre todas as FKs para suppliers.
begin;
select plan(1);
select set_eq(
  $$ select conrelid::regclass::text from pg_constraint
     where confrelid = 'public.suppliers'::regclass and contype = 'f' $$,
  array['vendor_prospects','prospect_conversations','prospect_quotes','quotations',
        'supplier_conversations','supplier_options','supplier_selections','contact_handoff_consents'],
  'todas as tabelas com FK para suppliers estão em SUPPLIER_REFERENCING_TABLES'
);
select * from finish();
rollback;
