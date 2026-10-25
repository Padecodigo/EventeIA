"use client";

import { useActionState, useRef, type ReactNode } from "react";

import { checkBalancesNowAction, softDeleteAction, updateBalanceAction, updateFixedCostAction, type CostsActionState } from "./actions";

const button = "rounded-full bg-primaria px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-primaria-escura disabled:opacity-50";

function Status({ state }: { state: CostsActionState }) {
  if (state.error) return <span role="alert" className="text-caption text-semantic-error">{state.error}</span>;
  if (state.success) return <span className="text-caption text-vinho/70">{state.success}</span>;
  return null;
}

const reais = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

/** Campo com rótulo visível + texto de ajuda (ligado por aria-describedby); empilha no celular. */
function Field(props: { id: string; label: string; help: string; children: (a: { id: string; "aria-describedby": string }) => ReactNode }) {
  const helpId = `${props.id}-help`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={props.id} className="text-caption font-semibold text-vinho/80">{props.label}</label>
      {props.children({ id: props.id, "aria-describedby": helpId })}
      <p id={helpId} className="text-caption text-vinho/60">{props.help}</p>
    </div>
  );
}

const field = "w-full rounded-full border border-line-subtle bg-off-white px-3 py-2 text-base sm:text-sm";

export const BALANCE_HELP = {
  balance: "Informado manualmente: quanto ainda há de crédito neste provedor.",
  budget: "Informado manualmente: quanto você aceita gastar por mês. Saldo = orçamento − gasto do mês.",
  threshold: "Mostra o selo “baixo” e envia e-mail quando o saldo fica abaixo deste valor.",
  runway: "Também alerta se, no ritmo atual de gasto, o saldo durar menos dias que isto.",
  note: "Livre, só para você (ex.: plano contratado, quem paga).",
} as const;

export function BalanceForm(props: { provider: string; manual: boolean; budget: boolean; budgetCents: number | null; balanceCents: number | null; thresholdCents: number; runwayDays: number; note: string | null }) {
  const [state, action, pending] = useActionState(updateBalanceAction, {});
  const id = (k: string) => `bal-${props.provider}-${k}`;
  return (
    <form action={action} className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-start" data-testid={`balance-form-${props.provider}`}>
      <input type="hidden" name="provider" value={props.provider} />
      {props.manual ? (
        <Field id={id("balance")} label="Saldo atual (R$)" help={BALANCE_HELP.balance}>
          {(a) => <input {...a} name="balance" inputMode="decimal" defaultValue={reais(props.balanceCents)} placeholder="0,00" className={field} />}
        </Field>
      ) : null}
      {props.budget ? (
        <Field id={id("budget")} label="Orçamento mensal (R$)" help={BALANCE_HELP.budget}>
          {(a) => <input {...a} name="budget" inputMode="decimal" defaultValue={reais(props.budgetCents)} placeholder="0,00" className={field} />}
        </Field>
      ) : null}
      <Field id={id("threshold")} label="Alertar abaixo de (R$)" help={BALANCE_HELP.threshold}>
        {(a) => <input {...a} name="threshold" inputMode="decimal" defaultValue={reais(props.thresholdCents)} className={field} required />}
      </Field>
      <Field id={id("runway")} label="Fôlego mínimo (dias)" help={BALANCE_HELP.runway}>
        {(a) => <input {...a} name="runwayDays" type="number" inputMode="numeric" min={1} max={90} defaultValue={props.runwayDays} className={field} />}
      </Field>
      <Field id={id("note")} label="Observação" help={BALANCE_HELP.note}>
        {(a) => <input {...a} name="note" defaultValue={props.note ?? ""} maxLength={300} className={field} />}
      </Field>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
        <button className={button} disabled={pending}>Salvar</button>
        <Status state={state} />
      </div>
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
    <form action={action} className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-start">
      <input type="hidden" name="id" value={id} />
      <Field id={`fix-${id}-amount`} label="Valor (R$)" help="Quanto este custo fixo custou no mês.">
        {(a) => <input {...a} name="amount" inputMode="decimal" defaultValue={reais(cents)} className={field} required />}
      </Field>
      <Field id={`fix-${id}-note`} label="Observação" help="Opcional (ex.: nº da fatura, motivo da correção).">
        {(a) => <input {...a} name="note" defaultValue={note ?? ""} maxLength={300} className={field} />}
      </Field>
      <div className="flex flex-wrap items-center gap-2 sm:pt-6">
        <button className={button} disabled={pending}>Salvar</button>
        <Status state={state} />
      </div>
    </form>
  );
}

/**
 * Botão "Excluir"/"Limpar histórico" com modal de confirmação que lista o que será apagado.
 * Exclusão recuperável (deleted_at); só admin.
 */
export function ConfirmDelete(props: { target: "fixed" | "alert"; items: { id: string; label: string }[]; label: string; title: string; testId?: string }) {
  const [state, action, pending] = useActionState(softDeleteAction, {});
  const ref = useRef<HTMLDialogElement>(null);
  if (props.items.length === 0) return null;
  return (
    <>
      <button type="button" data-testid={props.testId} onClick={() => ref.current?.showModal()}
        className="rounded-full border border-semantic-error/40 px-3 py-1.5 text-sm font-semibold text-semantic-error hover:bg-semantic-error/10">
        {props.label}
      </button>
      <Status state={state} />
      <dialog ref={ref} aria-labelledby={`${props.testId ?? props.target}-title`} className="w-[min(32rem,92vw)] rounded-card border border-line-subtle bg-off-white p-5 text-vinho shadow-soft backdrop:bg-black/40">
        <h4 id={`${props.testId ?? props.target}-title`} className="font-serif text-title-3">{props.title}</h4>
        <p className="mt-1 text-caption text-vinho/70">
          Será(ão) excluído(s) {props.items.length} item(ns). Eles somem do painel e dos totais, mas podem ser recuperados pelo suporte técnico (exclusão reversível).
        </p>
        <ul className="mt-3 max-h-60 list-disc overflow-y-auto pl-5 text-sm">
          {props.items.map((i) => <li key={i.id}>{i.label}</li>)}
        </ul>
        <form action={action} onSubmit={() => ref.current?.close()} className="mt-4 flex flex-wrap justify-end gap-2">
          <input type="hidden" name="target" value={props.target} />
          {props.items.map((i) => <input key={i.id} type="hidden" name="id" value={i.id} />)}
          <button type="button" onClick={() => ref.current?.close()} className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold">Cancelar</button>
          <button className="rounded-full bg-semantic-error px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending}>Confirmar exclusão</button>
        </form>
      </dialog>
    </>
  );
}
