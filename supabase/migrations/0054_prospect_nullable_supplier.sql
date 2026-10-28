-- 0054 — Conversas/quotes sem fornecedor vinculado (Messenger) — aditiva.
--
-- No Messenger o remetente é um PSID escopado pela Página e não mapeia para um
-- @handle público. Para o agente atender a DM mesmo assim (e o fornecedor se
-- identificar depois), a conversa e a cotação passam a aceitar supplier_id nulo.
-- Nada é apagado; apenas a restrição NOT NULL é relaxada.

alter table public.prospect_conversations alter column supplier_id drop not null;
alter table public.prospect_quotes alter column supplier_id drop not null;
