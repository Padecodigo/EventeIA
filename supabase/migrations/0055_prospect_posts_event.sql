-- 0055 — Post de prospecção vinculado ao evento — aditiva.
--
-- O plano passa a nascer das necessidades do evento (event_requirements) e cada
-- post publicado fica rastreável ao evento. Nada existente é alterado.

alter table public.prospect_posts add column if not exists event_id uuid references public.events (id);

create index if not exists prospect_posts_event_idx
  on public.prospect_posts (event_id) where event_id is not null;
