-- 0018 — Sessão WhatsApp conectada durante toda a coleta (até 48h).
-- Aditiva/expand: só AMPLIA o check (30–60 → 30–2880 minutos); valores antigos seguem válidos.
alter table public.whatsapp_instances
  drop constraint if exists whatsapp_instances_collection_window_minutes_check;

alter table public.whatsapp_instances
  add constraint whatsapp_instances_collection_window_minutes_check
  check (collection_window_minutes is null or collection_window_minutes between 30 and 2880);
