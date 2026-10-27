-- 0051 — Ciclo de vida do evento pelo cliente (aditiva, forward-only).
--
-- Contexto: a guarda de 0029 só permitia a transição draft -> awaiting_payment
-- para os papéis do cliente. Com isso, as ações de produto "Encerrar evento"
-- (active -> completed) e "Excluir evento" (soft delete -> canceled) — que
-- rodam com o JWT do usuário, sob RLS — batiam em 42501 e a action devolvia
-- apenas um erro genérico na tela.
--
-- O que muda: o cliente passa a poder fechar o ciclo de vida do próprio evento
-- (posse/workspace garantidos pela policy "events: dono/planner edita"):
--   * active   -> completed   (encerrar)
--   * qualquer -> canceled    (soft delete; nunca DELETE físico)
--
-- O que NÃO muda: nenhuma transição leva a 'active'. Ativação continua
-- exclusiva do servidor (webhook do pagamento e créditos), então o buraco que
-- 0029 fechou — ativar evento sem pagar — segue fechado. As colunas do
-- pipeline continuam sendo do servidor.

create or replace function public.guard_events_client_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'awaiting_payment') then
      raise exception 'status de evento não permitido para o cliente: %', new.status
        using errcode = '42501';
    end if;
    if new.discovery_started_at is not null or new.discovery_ends_at is not null
       or new.discovery_status is not null or new.collection_ended_at is not null
       or new.quotes_delivered_at is not null then
      raise exception 'campos do pipeline são definidos pelo servidor' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and not (
       (old.status = 'draft' and new.status = 'awaiting_payment')
       or (old.status = 'active' and new.status = 'completed')
       or (old.status <> 'canceled' and new.status = 'canceled')
     ) then
    raise exception 'transição de status de evento não permitida para o cliente: % -> %',
      old.status, new.status using errcode = '42501';
  end if;

  if new.owner_profile_id is distinct from old.owner_profile_id
     or new.discovery_started_at is distinct from old.discovery_started_at
     or new.discovery_ends_at is distinct from old.discovery_ends_at
     or new.discovery_status is distinct from old.discovery_status
     or new.collection_ended_at is distinct from old.collection_ended_at
     or new.quotes_delivered_at is distinct from old.quotes_delivered_at then
    raise exception 'campos do pipeline são definidos pelo servidor' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_events_client_write() is
  'Guarda de escrita do cliente em events: só cria em draft/awaiting_payment e só fecha o ciclo (completed/canceled). Nunca leva a active (0051).';
