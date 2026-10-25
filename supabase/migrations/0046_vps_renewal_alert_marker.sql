-- Aviso de vencimento da VPS por e-mail: marca para qual data de vencimento o aviso já foi enviado
-- (evita repetir). Aditiva; RLS de provider_balances (is_admin) continua valendo.
alter table public.provider_balances add column if not exists renewal_alerted_for date;
comment on column public.provider_balances.renewal_alerted_for is 'Data de vencimento para a qual o aviso por e-mail já foi enviado.';
