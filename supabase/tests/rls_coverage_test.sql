-- pgTAP: cobertura de RLS — garantia estrutural de default-deny em TODO o schema public.
--
-- 1) Toda tabela (pg_class relkind 'r') do schema public deve ter RLS habilitada
--    (relrowsecurity = true).
-- 2) Toda tabela deve ter ao menos UMA política em pg_policies — ou estar na allowlist
--    de tabelas intencionalmente "deny-all" (RLS habilitada, sem política: acesso apenas
--    via service_role / funções SECURITY DEFINER).
--
-- Allowlist de deny-all intencional (documentada pela migração que a define):
--   webhook_events       — 0002: "webhook_events: sem políticas → somente service_role".
--   support_rate_limits  — 0027: "support_rate_limits: sem políticas (só SECURITY DEFINER)".
--   testimonial_invites  — 0004: "Default deny; convites só via service_role".
--   welcome_rate_limits  — 0022: "Sem políticas: só funções SECURITY DEFINER tocam esta tabela".
--
-- Partições (ex.: system_events_default) herdam as políticas da tabela-mãe particionada
-- (system_events), então são consideradas cobertas via pg_inherits.

begin;

create extension if not exists pgtap;

select plan(2);

-- Tabelas candidatas: relkind 'r' no schema public, exceto objetos pertencentes a uma
-- extensão (ex.: pgTAP/PostGIS), detectados pela dependência de extensão (pg_depend deptype 'e').

-- 1) RLS habilitada em todas.
select is(
  array(
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
      and not c.relrowsecurity
    order by c.relname
  ),
  array[]::text[],
  'todas as tabelas públicas têm RLS habilitada (relrowsecurity = true)'
);

-- 2) Política presente, ou allowlist deny-all, ou partição coberta pela tabela-mãe.
select is(
  array(
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
      and not (
        exists (
          select 1
          from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.relname
        )
        or exists (
          select 1
          from pg_inherits i
          join pg_class parent on parent.oid = i.inhparent
          join pg_policies p on p.schemaname = 'public' and p.tablename = parent.relname
          where i.inhrelid = c.oid
        )
        or c.relname = any(array[
          'webhook_events',       -- 0002
          'support_rate_limits',  -- 0027
          'testimonial_invites',  -- 0004
          'welcome_rate_limits'   -- 0022
        ])
      )
    order by c.relname
  ),
  array[]::text[],
  'toda tabela pública tem política (ou está na allowlist deny-all)'
);

select * from finish();

rollback;
