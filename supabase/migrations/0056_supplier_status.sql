-- 0056 — Status do fornecedor na prospecção — aditiva.
--
-- Modela o ciclo do fornecedor: novo → marcado → comentou → respondeu → cotou
-- (ou descartado / opt-out). Backfill a partir dos sinais que já existem.
-- Nada é apagado; apenas a coluna e o índice são criados.

alter table public.suppliers add column if not exists status text not null default 'novo';

alter table public.suppliers drop constraint if exists suppliers_status_check;
alter table public.suppliers
  add constraint suppliers_status_check
  check (status in ('novo', 'marcado', 'comentou', 'respondeu', 'cotou', 'descartado', 'opt-out'));

update public.suppliers s
set status = case
  when s.opt_out_at is not null then 'opt-out'
  when exists (select 1 from public.prospect_quotes q where q.supplier_id = s.id) then 'cotou'
  when exists (select 1 from public.prospect_conversations c where c.supplier_id = s.id) then 'respondeu'
  when exists (select 1 from public.vendor_prospects p where p.supplier_id = s.id) then 'marcado'
  else 'novo'
end
where s.status = 'novo';

create index if not exists suppliers_status_idx on public.suppliers (status);
