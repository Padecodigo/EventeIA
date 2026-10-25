-- 0034 — Créditos nunca expiram (decisão de produto), para qualquer origem
-- (franquia, pacotes, avulso, extras). Aditiva: não apaga nem altera saldo.
--
-- 1) Trigger BEFORE INSERT força credit_ledger.expires_at := null, cobrindo a
--    concessão de franquia de 0009 (que gravava now() + 2 months) e qualquer
--    caminho futuro, sem reescrever process_payment_webhook.
-- 2) Novos lançamentos 'expire' são recusados (o job de expiração foi removido).
--    Lançamentos 'expire' já existentes permanecem (auditoria; ledger imutável).
-- 3) Lançamentos com expires_at preenchido passam a null (só metadado; os
--    valores/saldos não mudam). Em produção o ledger estava vazio ao aplicar.
-- Segurança: função SECURITY INVOKER, search_path fixo, sem EXECUTE para
-- clientes; não muda RLS nem grants de tabela.

create or replace function public.credit_ledger_no_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.entry_type = 'expire' then
    raise exception 'créditos não expiram: lançamento expire recusado';
  end if;
  new.expires_at := null;
  return new;
end;
$$;

revoke all on function public.credit_ledger_no_expiry() from public, anon, authenticated;

drop trigger if exists credit_ledger_no_expiry on public.credit_ledger;
create trigger credit_ledger_no_expiry
  before insert on public.credit_ledger
  for each row
  execute function public.credit_ledger_no_expiry();

update public.credit_ledger set expires_at = null where expires_at is not null;
