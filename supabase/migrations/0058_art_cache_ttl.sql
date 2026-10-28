-- 0058 — Arte do post com TTL de 1 hora — aditiva.
--
-- A imagem gerada (FLUX) é guardada no Storage por 1h para os reposts da mesma
-- necessidade/evento e depois excluída. `image_expires_at` marca a validade.

alter table public.prospect_posts add column if not exists image_expires_at timestamptz;

insert into storage.buckets (id, name, public)
values ('prospecting-art', 'prospecting-art', true)
on conflict (id) do nothing;

create index if not exists prospect_posts_image_expiry_idx
  on public.prospect_posts (image_expires_at)
  where image_expires_at is not null;
