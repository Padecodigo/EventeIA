-- 0071 — Índices para chaves estrangeiras sem cobertura (aditiva).
--
-- Ajuste de performance: algumas FKs criadas em 0065/0068 não tinham índice,
-- o que encarece joins, filtros e cascatas. Criados de forma idempotente e sem
-- qualquer alteração destrutiva. `contact_handoff_consents(quotation_id)` fica de
-- fora porque a unique (quotation_id, profile_id) já cobre a coluna à esquerda.

create index if not exists supplier_selections_supplier_idx
  on public.supplier_selections (supplier_id);
create index if not exists supplier_selections_option_idx
  on public.supplier_selections (option_id);
create index if not exists supplier_selections_chosen_by_idx
  on public.supplier_selections (chosen_by_profile_id);
create index if not exists supplier_selections_conversation_idx
  on public.supplier_selections (conversation_id);

create index if not exists contact_handoff_consents_profile_idx
  on public.contact_handoff_consents (profile_id);
