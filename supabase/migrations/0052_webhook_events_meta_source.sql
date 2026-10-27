-- 0052 — webhook_events aceita eventos do Meta (Instagram/Messenger) — aditiva.
--
-- O webhook único do Meta passa a persistir as mensagens recebidas na mesma
-- tabela de auditoria dos demais canais (dedup por source + external_event_id).
-- Apenas relaxa o CHECK de source; não altera nem apaga dados.

alter table public.webhook_events drop constraint if exists webhook_events_source_check;
alter table public.webhook_events
  add constraint webhook_events_source_check
  check (source in ('asaas', 'evolution', 'whatsapp_cloud', 'meta'));
