-- pgTAP: janela de coleta até 48h (0018).
begin;
create extension if not exists pgtap;
select plan(2);
select ok(exists (select 1 from pg_constraint where conname = 'whatsapp_instances_collection_window_minutes_check'
  and pg_get_constraintdef(oid) like '%2880%'), 'Check aceita até 2880 minutos');
select ok(not exists (select 1 from pg_constraint where conname = 'whatsapp_instances_collection_window_minutes_check'
  and pg_get_constraintdef(oid) like '%60)%'), 'Limite antigo de 60 minutos removido');
select * from finish();
rollback;
