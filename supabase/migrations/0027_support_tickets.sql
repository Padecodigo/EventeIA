-- 0027 — Central de atendimento: sugestões, reclamações, elogios e chamados (problemas).
-- Aditiva (expand): só cria tabelas/funções/bucket novos; nada existente é alterado.
-- RLS: dono lê/insere os próprios tickets e mensagens; admin (public.is_admin()) tudo.
-- Anônimos (site público) NÃO acessam via PostgREST: o servidor grava com service_role
-- depois de validar (zod) e aplicar rate limit (support_rate_hit).

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  email text check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  type text not null check (type in ('sugestao', 'reclamacao', 'elogio', 'problema')),
  subject text not null check (char_length(btrim(subject)) between 3 and 140),
  message text not null check (char_length(btrim(message)) between 10 and 5000),
  event_id uuid references public.events (id) on delete set null,
  page_url text check (page_url is null or char_length(page_url) <= 500),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  attachment_path text check (attachment_path is null or char_length(attachment_path) <= 300),
  status text not null default 'aberto'
    check (status in ('aberto', 'em_andamento', 'resolvido', 'fechado')),
  -- Sem default de coluna: o trigger aplica 'normal' (ou 'alta' para 'problema').
  priority text not null check (priority in ('baixa', 'normal', 'alta', 'urgente')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Toda solicitação precisa de um canal de resposta.
  constraint support_tickets_contact check (user_id is not null or email is not null)
);

create index support_tickets_user_created_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_status_created_idx on public.support_tickets (status, created_at desc);
create index support_tickets_type_idx on public.support_tickets (type);
create index support_tickets_event_idx on public.support_tickets (event_id) where event_id is not null;

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_role text not null check (author_role in ('user', 'admin')),
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

-- Rate limit (mesmo padrão de welcome_rate_limits): chave = HMAC do IP/conta, janela de 10 min.
create table public.support_rate_limits (
  key_hash text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key_hash, window_start)
);

alter table public.support_tickets enable row level security;
alter table public.support_tickets force row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_messages force row level security;
alter table public.support_rate_limits enable row level security;
alter table public.support_rate_limits force row level security;
-- support_rate_limits: sem políticas (só SECURITY DEFINER).

-- Defaults e campos controlados pelo servidor/admin.
create or replace function public.support_ticket_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
begin
  if new.priority is null or (auth.uid() is not null and not public.is_admin()) then
    new.priority := case when new.type = 'problema' then 'alta' else 'normal' end;
  end if;
  if auth.uid() is not null and not public.is_admin() then
    new.status := 'aberto';
  end if;
  -- Teto por identidade (inclui inserts diretos via PostgREST): 5 em 10 minutos.
  select count(*) into v_recent from public.support_tickets t
   where t.created_at > now() - interval '10 minutes'
     and ((new.user_id is not null and t.user_id = new.user_id)
       or (new.user_id is null and new.email is not null and lower(t.email) = lower(new.email)));
  if v_recent >= 5 then
    raise exception 'rate_limited' using errcode = 'P0429';
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger support_tickets_before_insert
  before insert on public.support_tickets
  for each row execute function public.support_ticket_before_insert();

create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- Resposta nova: atualiza updated_at; resposta do usuário reabre ticket resolvido.
create or replace function public.support_message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_tickets t
     set updated_at = now(),
         status = case when new.author_role = 'user' and t.status = 'resolvido' then 'aberto' else t.status end
   where t.id = new.ticket_id;
  return new;
end;
$$;

create trigger support_ticket_messages_after_insert
  after insert on public.support_ticket_messages
  for each row execute function public.support_message_after_insert();

revoke all on function public.support_ticket_before_insert() from public, anon, authenticated;
revoke all on function public.support_message_after_insert() from public, anon, authenticated;

-- Políticas: tickets
create policy "support_tickets: dono lê"
  on public.support_tickets for select to authenticated
  using (user_id = auth.uid());

create policy "support_tickets: dono insere"
  on public.support_tickets for insert to authenticated
  with check (
    user_id = auth.uid()
    and (event_id is null or exists (
      select 1 from public.events e where e.id = event_id and e.owner_profile_id = auth.uid()))
  );

create policy "support_tickets: admin tudo"
  on public.support_tickets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Políticas: mensagens
create policy "support_ticket_messages: dono lê"
  on public.support_ticket_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));

create policy "support_ticket_messages: dono responde"
  on public.support_ticket_messages for insert to authenticated
  with check (
    author_role = 'user'
    and author_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
       where t.id = ticket_id and t.user_id = auth.uid() and t.status <> 'fechado')
  );

create policy "support_ticket_messages: admin tudo"
  on public.support_ticket_messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert on public.support_tickets to authenticated;
grant update on public.support_tickets to authenticated; -- efetivo só para admin (RLS)
grant select, insert on public.support_ticket_messages to authenticated;

-- Rate limit chamado pelo servidor (service_role) com HMAC do IP. Retorna hits na janela.
create or replace function public.support_rate_hit(p_key_hash text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 600) * 600);
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_limit < 1 then
    raise exception 'invalid_args' using errcode = '22023';
  end if;
  insert into public.support_rate_limits as r (key_hash, window_start, hits)
  values (p_key_hash, v_window, 1)
  on conflict (key_hash, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  delete from public.support_rate_limits
   where key_hash = p_key_hash and window_start < now() - interval '1 day';
  if v_hits > p_limit then
    raise exception 'rate_limited' using errcode = 'P0429';
  end if;
  return v_hits;
end;
$$;

revoke all on function public.support_rate_hit(text, integer) from public, anon, authenticated;
grant execute on function public.support_rate_hit(text, integer) to service_role;

-- Anexos (captura de tela): bucket PRIVADO, 5 MB, só imagens. Caminho: <user_id|anon>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "support-attachments: dono lê"
  on storage.objects for select to authenticated
  using (bucket_id = 'support-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "support-attachments: dono envia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'support-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "support-attachments: admin lê"
  on storage.objects for select to authenticated
  using (bucket_id = 'support-attachments' and public.is_admin());
