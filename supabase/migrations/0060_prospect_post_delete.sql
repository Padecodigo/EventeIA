-- 0060 — Exclusão de posts de isca após a prospecção (aditiva).
--
-- O post publicado no Instagram fica registrado em prospect_posts com o
-- ig_media_id. Ao terminar a prospecção do evento (status completed/canceled)
-- ou, para posts sem evento, após o TTL, o worker apaga a mídia no Instagram e
-- marca deleted_at aqui (soft delete auditável; nada é apagado do banco).
--
-- Forward-only, aditivo: não altera nem remove dados existentes.

alter table public.prospect_posts
  add column if not exists deleted_at timestamptz;

create index if not exists prospect_posts_deleted_idx
  on public.prospect_posts (deleted_at)
  where deleted_at is not null;
