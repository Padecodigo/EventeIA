-- 0077 — Exclusão antecipada do post de isca quando todos os marcados já contataram (aditiva).
--
-- prospect_posts passa a guardar os @ marcados (tagged_handles) e os que já
-- falaram com a EventeIA por comentário ou DM (contacted_handles). O worker de
-- exclusão apaga a mídia no Instagram quando tagged ⊆ contacted, mesmo com o
-- evento ainda ativo. Handles normalizados: minúsculos, sem "@".
--
-- Forward-only, aditivo: só adiciona colunas com default '{}' e uma função
-- service_role. Nenhum dado existente é alterado.

alter table public.prospect_posts
  add column if not exists tagged_handles text[] not null default '{}',
  add column if not exists contacted_handles text[] not null default '{}';

comment on column public.prospect_posts.tagged_handles is
  '@ marcados no post (minúsculos, sem @).';
comment on column public.prospect_posts.contacted_handles is
  '@ marcados que já contataram (comentário/DM).';

create index if not exists prospect_posts_tagged_handles_idx
  on public.prospect_posts using gin (tagged_handles)
  where deleted_at is null;

-- Marca o contato de um @ em todos os posts ativos que o marcaram. Idempotente.
create or replace function public.mark_prospect_post_contact(p_handle text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text := lower(btrim(coalesce(p_handle, ''), ' @'));
  v_count integer;
begin
  if v_handle = '' then
    return 0;
  end if;
  update public.prospect_posts
     set contacted_handles = array_append(contacted_handles, v_handle),
         updated_at = now()
   where deleted_at is null
     and v_handle = any (tagged_handles)
     and not (v_handle = any (contacted_handles));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_prospect_post_contact(text) from public, anon, authenticated;
grant execute on function public.mark_prospect_post_contact(text) to service_role;
