-- 0067 — Chat mediado no evento (aditiva).
--
-- As mensagens de `supplier_conversation_messages` já existiam desde a 0063
-- (direction in/out + moderated). Aqui só identificamos QUEM originou a mensagem
-- de saída, para o chat in-app distinguir o usuário, um agente da EventeIA e
-- mensagens de sistema. Nada é apagado/alterado em dados existentes; linhas
-- antigas ficam com `author = null` (o app as trata como saída do usuário).

alter table public.supplier_conversation_messages
  add column if not exists author text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplier_conversation_messages_author_check'
  ) then
    alter table public.supplier_conversation_messages
      add constraint supplier_conversation_messages_author_check
      check (author is null or author in ('user', 'agent', 'system'));
  end if;
end $$;
