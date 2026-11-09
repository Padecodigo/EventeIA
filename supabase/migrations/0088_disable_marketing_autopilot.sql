-- 0088 — Desativa o autopilot de publicidade (forward-only).
--
-- O código do autopilot de marketing foi removido: a única publicação
-- automática é o post de isca da prospecção. A flag em `app_settings` é
-- preservada para compatibilidade, mas fica explicitamente desligada e
-- marcada como obsoleta. Nenhuma tabela é removida (app_settings e
-- autopilot_media são compartilhadas e seguem o padrão expand → migrate → contract).

insert into public.app_settings (key, value)
values (
  'marketing_autopilot',
  jsonb_build_object('enabled', false, 'deprecated', true, 'updatedAt', now())
)
on conflict (key) do update
set value = coalesce(public.app_settings.value, '{}'::jsonb)
             || jsonb_build_object('enabled', false, 'deprecated', true, 'updatedAt', now()),
    updated_at = now();
