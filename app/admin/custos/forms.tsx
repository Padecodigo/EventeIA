"use client";

import { useActionState } from "react";

import { checkBalancesNowAction, updateBalanceAction, updateFixedCostAction, type CostsActionState } from "./actions";

const input = "w-28 rounded-full border border-line-subtle bg-off-white px-3 py-1.5 text-sm";
const button = "rounded-full bg-primaria px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-primaria-escura disabled:opacity-50";

function Status({ state }: { state: CostsActionState }) {
  if (state.error) return <span role="alert" className="text-caption text-semantic-error">{state.error}</span>;
  if (state.success) return <span className="text-caption text-vinho/70">{state.success}</span>;
  return null;
}

const reais = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

export function BalanceForm(props: { provider: string; manual: boolean; budget: boolean; budgetCents: number | null; balanceCents: number | null; thresholdCents: number; runwayDays: number; note: string | null }) {
  const [state, action, pending] = useActionState(updateBalanceAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" data-testid={`balance-form-${props.provider}`}>
      <input type="hidden" name="provider" value={props.provider} />
      {props.manual ? (
        <input name="balance" defaultValue={reais(props.balanceCents)} placeholder="Saldo R$" aria-label="Saldo em R$" className={input} />
      ) : null}
      {props.budget ? (
        <input name="budget" defaultValue={reais(props.budgetCents)} placeholder="Orçamento/mês R$" aria-label="Orçamento mensal em R$" className={input} />
      ) : null}
      <input name="threshold" defaultValue={reais(props.thresholdCents)} aria-label="Alertar abaixo de R$" title="Alertar abaixo de R$" className={input} required />
      <input name="runwayDays" type="number" min={1} max={90} defaultValue={props.runwayDays} aria-label="Dias mínimos de fôlego" title="Dias mínimos de fôlego" className="w-16 rounded-full border border-line-subtle bg-off-white px-3 py-1.5 text-sm" />
      <input name="note" defaultValue={props.note ?? ""} placeholder="Obs." aria-label="Observação" maxLength={300} className={input} />
      <button className={button} disabled={pending}>Salvar</button>
      <Status state={state} />
    </form>
  );
}

export function CheckNowButton() {
  const [state, action, pending] = useActionState(checkBalancesNowAction, {});
  return (
    <form action={action} className="flex items-center gap-3">
      <button className={button} disabled={pending}>{pending ? "Verificando…" : "Verificar saldos agora"}</button>
      <Status state={state} />
    </form>
  );
}

export function FixedCostEdit({ id, cents, note }: { id: string; cents: number; note: string | null }) {
  const [state, action, pending] = useActionState(updateFixedCostAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="amount" defaultValue={reais(cents)} aria-label="Valor em R$" className={input} required />
      <input name="note" defaultValue={note ?? ""} placeholder="Obs." aria-label="Observação" maxLength={300} className={input} />
      <button className={button} disabled={pending}>Salvar</button>
      <Status state={state} />
    </form>
  );
}
