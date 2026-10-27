# DATABASE_RLS.md — Schemas de Tabelas e Políticas Supabase RLS

> **Fonte da verdade de dados.** Última revisão: 2026-10-22.
> Irmãos: [PAYMENTS.md](PAYMENTS.md) (pagamentos) · [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) (créditos) · [FEEDS.md](FEEDS.md) (eventos de sistema) · [SECURITY.md](SECURITY.md).
> Convenções: valores monetários em **centavos** (`bigint`, sufixo `_cents`), timestamps `timestamptz`, IDs `uuid` (default `gen_random_uuid()`).

---

## 1. Princípios

1. **Default deny** — toda tabela nasce com RLS habilitada e **force RLS**: sem política, sem acesso.
2. **RLS é a autorização real** — o client anon/authenticated só vê o que as políticas permitem; a `service_role` é exclusiva de servidor e usada apenas quando o fluxo exige (webhooks, jobs).
3. **Defesa em profundidade** — além da RLS, validação zod nas bordas, constraints no banco, privilégios de coluna mínimos.
4. **Políticas testáveis** — toda policy tem teste pgTAP (seção 8) no CI.

---

## 2. Papéis e identidade

- `auth.users` (Supabase Auth) → `public.profiles` (1:1, `id` = user id).
- `profiles.role`: `b2c` | `b2b` | `admin`. Alteração de `role` **somente** via `service_role` (admin) — coluna com `GRANT UPDATE` revogado para `authenticated`.
- JWT do Supabase carrega `sub` (user id) e `role` (authenticated). `auth.uid()` retorna `sub`.
- **Workspaces (B2B)**: `workspaces` + `workspace_members`; acesso a eventos via pertencimento (`owner` | `planner` | `viewer`).

---

## 3. Schemas das tabelas principais

```sql
-- ========== PERFIS ==========
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'b2c' check (role in ('b2c','b2b','admin')),
  display_name text not null,
  phone_e164 text,                      -- E.164 p/ WhatsApp: +5511999999999
  document_type text not null default 'cpf' check (document_type in ('cpf','cnpj')),
  document_number text,                 -- CPF/CNPJ: criptografar/mascarar — ver §7
  asaas_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== WORKSPACES (B2B) ==========
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  name text not null,
  plan_code text not null default 'essencial' references public.plans(code),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null check (member_role in ('owner','planner','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);

-- ========== EVENTOS ==========
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id),
  workspace_id uuid null references public.workspaces(id),  -- B2B; null p/ B2C
  title text not null,
  event_type text not null,             -- casamento | aniversario | corporativo | ...
  event_date date not null,
  region_code text not null,
  guest_count int not null check (guest_count between 1 and 5000),
  status text not null default 'draft'
    check (status in ('draft','awaiting_payment','active','completed','canceled')),
  created_at timestamptz not null default now()
);

-- Transições de status permitidas ao cliente (trigger guard_events_client_write,
-- 0029 + 0051). A RLS "events: dono/planner edita" já limita a linha ao dono ou
-- a quem edita o workspace; a guarda limita o destino:
--   draft -> awaiting_payment   (concluir a compra)
--   active -> completed          (encerrar o evento)
--   *     -> canceled            (soft delete; nunca DELETE físico)
-- Nenhuma transição leva a 'active': ativação é exclusiva do servidor
-- (webhook do pagamento e créditos), para o cliente não liberar a descoberta
-- e o WhatsApp sem pagar.

-- Tíquete B2C (1 por evento quando comprado)
create table public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id),
  status text not null default 'pending'
    check (status in ('pending','active','refunded')),
  payment_id uuid null references public.payments(id),
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

-- ========== COTAÇÕES ==========
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  category text not null,               -- buffet | musica | flores | foto | ...
  vendor_name text not null,
  vendor_contact text,
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null default 'draft'
    check (status in ('draft','sent','confirmed','declined','expired')),
  engine_version text not null,
  created_at timestamptz not null default now()
);

-- ========== DEPOIMENTOS REAIS (moderados) ==========
create table public.testimonial_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid unique references public.testimonial_invites(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  author_name text not null,
  city text,
  event_context text,
  audience text not null default 'b2c' check (audience in ('b2c','b2b')),
  quote text not null,
  outcome text,
  consent_given boolean not null,
  consent_text_version text not null,
  consent_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint testimonials_consent_required check (consent_given = true)
);

-- Escrita apenas service_role; leitura pública só do aprovado+publicado.
create policy "testimonials: leitura pública"
  on public.testimonials for select to anon, authenticated
  using (published = true and status = 'approved');

-- Snapshot do orçamento (motor determinístico — nunca recalculado em silêncio)
create table public.budget_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  engine_version text not null,
  total_cents bigint not null check (total_cents >= 0),
  breakdown jsonb not null,             -- LineItem[] congelado
  created_at timestamptz not null default now()
);

-- ========== CUPONS (B2C — ver COMMERCIAL_MODEL.md §2.4) ==========
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed_cents')),
  value integer not null check (value > 0),
  active boolean not null default true,
  expires_at timestamptz,
  max_redemptions integer,
  redemptions integer not null default 0,
  created_at timestamptz not null default now()
);
-- RLS default-deny SEM políticas: código não é enumerável; validação via service_role.
alter table public.coupons enable row level security;
alter table public.coupons force row level security;

-- ========== COBRANÇAS / CRÉDITOS (ver PAYMENTS.md e COMMERCIAL_MODEL.md) ==========
-- payments, subscriptions, webhook_events, credit_ledger, plans,
-- whatsapp_messages, system_events — DDL completo em seus documentos irmãos.
```

---

## 4. Políticas RLS — perfis

```sql
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Leitura: o próprio perfil. Admin: todos (via função security definer).
create policy "profiles: leitura do próprio"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles: leitura admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- Atualização: apenas o próprio, e apenas colunas editáveis.
-- (role/document_number/asaas_customer_id têm UPDATE revogado — §7)
create policy "profiles: atualização do próprio"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Inserção: apenas o próprio id (trigger/seed cria o profile no signup via service_role).
create policy "profiles: criação do próprio"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- Nenhum DELETE por usuários comuns (exclusão via fluxo LGPD com service_role).
```

---

## 5. Políticas RLS — workspaces, eventos e cotações

```sql
-- ---------- HELPER FUNCTIONS ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.profile_id = auth.uid()
  );
$$;

create or replace function public.can_edit_workspace(ws uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.profile_id = auth.uid()
      and m.member_role in ('owner','planner')
  );
$$;

-- ---------- WORKSPACES ----------
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;

create policy "workspaces: membros leem"
  on public.workspaces for select to authenticated
  using (public.is_workspace_member(id) or owner_id = auth.uid());

create policy "workspaces: owner cria"
  on public.workspaces for insert to authenticated
  with check (owner_id = auth.uid());

create policy "workspaces: owner atualiza"
  on public.workspaces for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------- WORKSPACE MEMBERS ----------
alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;

create policy "members: membros leem"
  on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "members: owner/planner gerem"
  on public.workspace_members for insert to authenticated
  with check (public.can_edit_workspace(workspace_id));

create policy "members: owner remove"
  on public.workspace_members for delete to authenticated
  using (public.can_edit_workspace(workspace_id)
         and profile_id <> auth.uid());   -- não remova a si mesmo

-- ---------- EVENTS ----------
alter table public.events enable row level security;
alter table public.events force row level security;

create policy "events: dono lê"
  on public.events for select to authenticated
  using (owner_profile_id = auth.uid());

create policy "events: membros do workspace leem"
  on public.events for select to authenticated
  using (workspace_id is not null and public.is_workspace_member(workspace_id));

create policy "events: dono cria"
  on public.events for insert to authenticated
  with check (owner_profile_id = auth.uid()
              and (workspace_id is null or public.can_edit_workspace(workspace_id)));

create policy "events: dono/planner edita"
  on public.events for update to authenticated
  using (owner_profile_id = auth.uid()
         or (workspace_id is not null and public.can_edit_workspace(workspace_id)))
  with check (owner_profile_id = auth.uid()
              or (workspace_id is not null and public.can_edit_workspace(workspace_id)));

-- Sem DELETE físico: exclusão é status='canceled' (soft delete) — ver AGENTS.md.

-- ---------- QUOTATIONS (via posse do evento) ----------
alter table public.quotations enable row level security;
alter table public.quotations force row level security;

create policy "quotations: acesso via evento"
  on public.quotations for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = quotations.event_id
      and (e.owner_profile_id = auth.uid()
           or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id)))
  ));

create policy "quotations: escrita via evento editável"
  on public.quotations for insert to authenticated
  with check (exists (
    select 1 from public.events e
    where e.id = event_id
      and (e.owner_profile_id = auth.uid()
           or (e.workspace_id is not null and public.can_edit_workspace(e.workspace_id)))
  ));

-- ---------- BUDGET SNAPSHOTS ----------
alter table public.budget_snapshots enable row level security;
alter table public.budget_snapshots force row level security;
create policy "snapshots: leitura via evento"
  on public.budget_snapshots for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = budget_snapshots.event_id
      and (e.owner_profile_id = auth.uid()
           or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id)))
  ));
-- INSERT: somente service_role (motor executa no servidor).
```

---

## 6. Regras de acesso por tabela (mapa rápido)

| Tabela | anon | authenticated (dono) | member workspace | service_role |
|---|---|---|---|---|
| `profiles` | ✗ | R/U próprio | R via workspace? **Não** (privacidade) | tudo |
| `workspaces` | ✗ | owner CRUD | R (membros) | tudo |
| `workspace_members` | ✗ | owner gerencia | R | tudo |
| `events` | ✗ | CRUD próprio | R; W se planner | tudo |
| `quotations` | ✗ | via evento | via evento | tudo |
| `budget_snapshots` | ✗ | R via evento | R via evento | tudo (INSERT) |
| `payments` | ✗ | R próprio | R (owner/planner) | tudo |
| `credit_ledger` | ✗ | — | R (membros) | tudo |
| `whatsapp_messages` | ✗ | R via evento | R via evento | tudo |
| `system_events` | ✗ | — (consulta via API) | — | tudo |
| `testimonial_invites` | ✗ | ✗ | ✗ | tudo |
| `testimonials` | R (apenas `published` e `approved`) | R (apenas publicado) | R (apenas publicado) | tudo |
| `webhook_events` | ✗ | ✗ | ✗ | tudo |
| `coupons` | ✗ | ✗ (validação via service_role) | ✗ | tudo |

---

## 7. Proteção de colunas sensíveis

- `document_number` (CPF/CNPJ) é **dado pessoal**: armazenar criptografado (pgsodium/`pgcrypto` com chave no Vault) OU mascarado + hash para busca. Exibição apenas dos últimos 4 dígitos; nunca em logs/feeds.
- `GRANT UPDATE` em `profiles` limitado às colunas editáveis:

```sql
revoke update on public.profiles from authenticated;
grant update (display_name, phone_e164) on public.profiles to authenticated;
```

- `role`, `document_type`, `document_number`, `asaas_customer_id`: somente `service_role`.
- `payments`, `subscriptions`, `webhook_events`, `credit_ledger`: `INSERT/UPDATE` somente `service_role`; usuários têm apenas `SELECT` conforme políticas.
- **Nenhuma policy com `USING (true)`** — código violador é bloqueado em code review (AGENTS.md §3.1) e por teste estático no CI.

---

## 8. Testes de RLS (obrigatórios no CI)

```sql
-- Exemplo pgTAP (tests/rls/events.sql)
begin;
select plan(6);

-- autentica como Alice (dona do evento A)
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-...', 'role', 'authenticated')::text, true);
set local role authenticated;

select results_eq(
  $$ select count(*) from public.events where id = 'evt-A' $$,
  array[1::bigint], 'dona lê o próprio evento');

select results_eq(
  $$ select count(*) from public.events where id = 'evt-B' $$,
  array[0::bigint], 'não lê evento de outra pessoa');

-- tenta forjar acesso a workspace alheio: 0 linhas / erro
-- tenta UPDATE de role: deve falhar por privilégio de coluna
-- member 'viewer' tenta INSERT em quotations: deve falhar (0 rows afetados)

select * from finish();
rollback;
```

Cenários mínimos por tabela: próprio × alheio × membro × viewer × admin × service_role. O job `database` do CI ([ci.yml](../.github/workflows/ci.yml)) roda estes testes contra o Supabase local.

---

## 9. Migrações (regras)

1. **Forward-only**: nunca editar migração aplicada; correção = nova migração.
2. **Expand → migrate → contract** para mudanças incompatíveis (nova coluna nullable → preencher → tornar NOT NULL → remover antiga em deploy posterior).
3. Toda migração que cria tabela deve, no mesmo arquivo: `enable row level security` + `force row level security` + políticas iniciais.
4. Tipos do banco: manter `lib/supabase/types.ts` em sincronia com as migrações **no mesmo PR**; o CI executa `supabase gen types` contra o banco local para garantir que o schema gera tipos válidos.
5. Seeds (`supabase/seed.sql`) apenas para ambiente local — jamais em produção.
