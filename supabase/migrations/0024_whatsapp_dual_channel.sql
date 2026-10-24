-- Canal WhatsApp duplo: Cloud API oficial da Meta (número da EventeIA, primário)
-- + Evolution API (WhatsApp do próprio cliente, fallback).
--
-- ┌─ Nota de revisão (Supabase + Security review) ───────────────────────────────┐
-- │ Migração ADITIVA (expand): só adiciona colunas anuláveis e amplia um CHECK.   │
-- │   Nenhum DROP/DELETE/UPDATE de dados; código antigo continua funcionando.     │
-- │ RLS: nenhuma política nova/alterada. profiles/events já têm RLS forçada por   │
-- │   posse; whatsapp_channel herda essas políticas (o dono pode escolher o canal  │
-- │   do próprio evento/perfil). webhook_events continua só service_role.         │
-- │ Segredos: nenhum segredo no banco — tokens da Meta vivem só em env do servidor.│
-- │ Webhook Cloud: assinatura X-Hub-Signature-256 validada no app antes de gravar. │
-- │ Numeração: 0023 está reservada pelo branch feat/confirmation-recap.           │
-- └──────────────────────────────────────────────────────────────────────────────┘

-- null = padrão (cloud quando configurada, senão evolution).
alter table public.profiles
  add column if not exists whatsapp_channel text
    check (whatsapp_channel is null or whatsapp_channel in ('cloud', 'evolution'));

alter table public.events
  add column if not exists whatsapp_channel text
    check (whatsapp_channel is null or whatsapp_channel in ('cloud', 'evolution'));

-- Auditoria: por qual canal cada mensagem saiu/entrou (null = histórico anterior).
alter table public.whatsapp_messages
  add column if not exists channel text
    check (channel is null or channel in ('cloud', 'evolution'));

-- Nova origem de webhook: Cloud API da Meta.
alter table public.webhook_events drop constraint if exists webhook_events_source_check;
alter table public.webhook_events
  add constraint webhook_events_source_check
    check (source in ('asaas', 'evolution', 'whatsapp_cloud'));
