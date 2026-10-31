-- 0064 — Campos opcionais de contato no perfil (WhatsApp + Instagram) — aditiva.
--
-- Adiciona `contact_whatsapp_e164` (E.164 do WhatsApp do próprio usuário) e
-- `instagram_handle` (@ do próprio usuário) ao perfil. São dados de contato do
-- cadastro/perfil — NÃO reativam o canal WhatsApp removido (o produto segue
-- falando com clientes só por Instagram DM/Messenger; ver .context/ARCHITECTURE.md).
-- A validação de formato acontece na borda (zod + lib/phone.ts e lib/instagram-handle.ts).
--
-- RLS já existe (0002): "profiles: atualização do próprio" restringe a linha ao
-- dono. Aqui apenas estendemos o GRANT de UPDATE das colunas editáveis ao
-- `authenticated`, no mesmo padrão de display_name/phone_e164.

alter table public.profiles add column if not exists contact_whatsapp_e164 text;
alter table public.profiles add column if not exists instagram_handle text;

-- Defesa em profundidade: formato básico validado também no banco. O arroba é
-- opcional (o cliente pode digitar com ou sem); a coluna guarda o handle normalizado.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_instagram_handle_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_instagram_handle_format
      check (
        instagram_handle is null
        or instagram_handle ~ '^[a-z0-9._]{1,30}$'
      );
  end if;
end $$;

-- Colunas editáveis pelo próprio usuário (mesmo padrão de 0002).
grant update (contact_whatsapp_e164, instagram_handle) on public.profiles to authenticated;
