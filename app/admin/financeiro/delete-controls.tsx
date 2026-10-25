"use client";

import { useActionState, useRef, useState } from "react";

import { clearCostPeriodAction, deleteCostRowsAction, type FinanceActionState } from "./actions";

const danger = "rounded-full border border-semantic-error/40 px-3 py-1 text-caption font-semibold text-semantic-error hover:bg-semantic-error/10";
const dialogCls = "w-[min(32rem,92vw)] rounded-card border border-line-subtle bg-off-white p-5 text-vinho shadow-soft backdrop:bg-black/40";

function Msg({ s }: { s: FinanceActionState }) {
  if (s.error) return <span role="alert" className="text-caption text-semantic-error">{s.error}</span>;
  if (s.success) return <span className="text-caption text-vinho/70">{s.success}</span>;
  return null;
}

/** "Excluir" de uma linha de custo, com modal de confirmação. */
export function DeleteCostRow({ refId, label }: { refId: string; label: string }) {
  const [state, action, pending] = useActionState(deleteCostRowsAction, {});
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={danger} onClick={() => ref.current?.showModal()} data-testid={`delete-cost-${refId}`}>Excluir</button>
      <Msg s={state} />
      <dialog ref={ref} className={dialogCls} aria-label="Excluir lançamento">
        <h4 className="font-serif text-title-3">Excluir 1 lançamento de custo?</h4>
        <p className="mt-2 text-sm">{label}</p>
        <p className="mt-1 text-caption text-vinho/70">Ele sai das listas e dos totais. Exclusão reversível (o suporte técnico consegue recuperar).</p>
        <form action={action} onSubmit={() => ref.current?.close()} className="mt-4 flex justify-end gap-2">
          <input type="hidden" name="ref" value={refId} />
          <button type="button" onClick={() => ref.current?.close()} className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold">Cancelar</button>
          <button disabled={pending} className="rounded-full bg-semantic-error px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirmar exclusão</button>
        </form>
      </dialog>
    </>
  );
}

/** "Limpar custos do período", com filtro opcional por provedor e contagem exata no modal. */
export function ClearCostPeriod({ from, to, counts, labels }: { from: string; to: string; counts: Record<string, number>; labels: Record<string, string> }) {
  const [state, action, pending] = useActionState(clearCostPeriodAction, {});
  const [provider, setProvider] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const n = provider === "" ? total : (counts[provider] ?? 0);
  if (total === 0) return null;
  const br = (d: string) => d.split("-").reverse().join("/");
  return (
    <>
      <button type="button" className={danger} onClick={() => ref.current?.showModal()} data-testid="clear-costs">Limpar custos do período</button>
      <Msg s={state} />
      <dialog ref={ref} className={dialogCls} aria-label="Limpar custos do período">
        <h4 className="font-serif text-title-3">Limpar custos de {br(from)} a {br(to)}?</h4>
        <form action={action} onSubmit={() => ref.current?.close()} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <label className="flex flex-col gap-1 text-caption font-semibold">Provedor
            <select name="provider" value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-full border border-line-subtle bg-white px-3 py-2 text-sm">
              <option value="">Todos ({total})</option>
              {Object.entries(counts).map(([p, c]) => <option key={p} value={p}>{labels[p] ?? p} ({c})</option>)}
            </select>
            <span className="font-normal text-vinho/60">Escolha um provedor para limpar só os custos dele.</span>
          </label>
          <p data-testid="clear-costs-count" className="text-sm"><strong>{n}</strong> lançamento(s) de custo serão excluídos. Pagamentos e receitas NÃO são afetados. Exclusão reversível.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold">Cancelar</button>
            <button disabled={pending || n === 0} className="rounded-full bg-semantic-error px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirmar exclusão</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
