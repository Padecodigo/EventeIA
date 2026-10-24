-- pgTAP: canal WhatsApp duplo (0024) — colunas aditivas e CHECKs.
begin;
create extension if not exists pgtap;
select plan(7);

select has_column('public', 'profiles', 'whatsapp_channel', 'profiles.whatsapp_channel existe');
select has_column('public', 'events', 'whatsapp_channel', 'events.whatsapp_channel existe');
select has_column('public', 'whatsapp_messages', 'channel', 'whatsapp_messages.channel existe');
select col_is_null('public', 'events', 'whatsapp_channel', 'events.whatsapp_channel é anulável (padrão)');

select lives_ok(
  $$ insert into public.webhook_events (source, external_event_id, payload, status)
     values ('whatsapp_cloud', 'message:wamid.T1', '{}'::jsonb, 'received') $$,
  'webhook_events aceita source whatsapp_cloud');
select throws_ok(
  $$ insert into public.webhook_events (source, external_event_id, payload, status)
     values ('outro', 'x:1', '{}'::jsonb, 'received') $$,
  '23514', null, 'source desconhecido continua rejeitado');
select col_has_check('public', 'events', 'whatsapp_channel', 'events.whatsapp_channel tem CHECK de canal');

select * from finish();
rollback;
