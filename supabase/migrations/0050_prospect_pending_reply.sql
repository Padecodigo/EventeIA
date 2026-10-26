-- 0050 — Resposta pendente de aprovação ao fornecedor (triagem por IA).
-- A IA redige a resposta quando o fornecedor faz uma pergunta (dúvida) e ainda
-- não mandou valor; o usuário revisa e aprova no painel antes do envio.

alter table public.vendor_prospects add column if not exists pending_reply text;
alter table public.vendor_prospects add column if not exists pending_reply_kind text;
alter table public.vendor_prospects add column if not exists pending_reply_at timestamptz;

alter table public.vendor_prospects drop constraint if exists vendor_prospects_pending_reply_kind_check;
alter table public.vendor_prospects
  add constraint vendor_prospects_pending_reply_kind_check
  check (
    pending_reply_kind is null
    or pending_reply_kind in ('question', 'values', 'unavailable', 'other')
  );
