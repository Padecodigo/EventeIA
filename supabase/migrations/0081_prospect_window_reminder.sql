-- 0081 — Lembrete da janela de 24h nas conversas de prospecção (aditiva).
--
-- Guarda, por conversa, para QUAL janela (id da última mensagem recebida do
-- fornecedor) o lembrete já saiu. Só uma nova mensagem do fornecedor abre nova
-- janela e, portanto, permite novo lembrete. O worker faz claim atômico:
--   update ... set reminder_sent_for_window = <msg> where id = ? and
--   reminder_sent_for_window is distinct from <msg>
-- Nada aqui altera nem apaga dados existentes; RLS/policies inalteradas
-- (escrita continua só service_role; leitura só admin).

alter table public.prospect_conversations
  add column if not exists reminder_sent_for_window text,
  add column if not exists reminder_sent_at timestamptz;

comment on column public.prospect_conversations.reminder_sent_for_window is
  'Id da última mensagem recebida (janela de 24h) para a qual o lembrete já foi enviado.';
