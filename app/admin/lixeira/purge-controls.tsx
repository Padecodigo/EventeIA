"use client";

import { useActionState, useRef, useState } from "react";

import { PURGE_CONFIRM_WORD } from "@/lib/admin/trash";

import { purgeAction, type PurgeState } from "./actions";

/** Botão de exclusão definitiva com diálogo "digite EXCLUIR" (ação permanente). */
export function PurgeButton({ kind, ids, scope, label, title, items, warning, testId }: {
  kind: string;
  ids?: string[];
  scope?: "all";
  label: string;
  title: string;
  items: string[];
  warning?: string;
  testId: string;
}) {
  const [state, action, pending] = useActionState<PurgeState, FormData>(purgeAction, null);
  const [typed, setTyped] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const ok = typed.trim().toUpperCase() === PURGE_CONFIRM_WORD;
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" data-testid={testId} onClick={() => ref.current?.showModal()}
        className="rounded-full border border-semantic-error/40 px-3 py-1 text-caption font-semibold text-semantic-error hover:bg-semantic-error/10">
        {label}
      </button>
      {state ? <p role={state.ok ? "status" : "alert"} className={`max-w-md text-right text-caption ${state.ok ? "text-vinho/70" : "text-semantic-error"}`}>{state.message}</p> : null}
      <dialog ref={ref} aria-labelledby={`${testId}-title`} className="w-[min(34rem,92vw)] rounded-card border border-line-subtle bg-off-white p-5 text-vinho shadow-soft backdrop:bg-black/40">
        <h4 id={`${testId}-title`} className="font-serif text-title-3">{title}</h4>
        <p className="mt-2 text-sm font-semibold text-semantic-error">Esta ação é permanente: os itens serão apagados de verdade e não poderão ser restaurados.</p>
        {warning ? <p className="mt-2 text-caption text-vinho/70">{warning}</p> : null}
        {items.length ? <ul className="mt-3 max-h-40 list-disc overflow-y-auto pl-5 text-caption">{items.slice(0, 20).map((t, i) => <li key={i}>{t}</li>)}{items.length > 20 ? <li>… e mais {items.length - 20}</li> : null}</ul> : null}
        <form action={action} onSubmit={() => { ref.current?.close(); setTyped(""); }} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="kind" value={kind} />
          {scope ? <input type="hidden" name="scope" value={scope} /> : null}
          {(ids ?? []).map((id) => <input key={id} type="hidden" name="id" value={id} />)}
          <label className="text-caption">
            Para confirmar, digite <strong>{PURGE_CONFIRM_WORD}</strong>:
            <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label={`Digite ${PURGE_CONFIRM_WORD} para confirmar`}
              className="mt-1 block w-full rounded-input border border-line-subtle bg-white px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => { ref.current?.close(); setTyped(""); }} className="rounded-full border border-line-strong px-4 py-2 font-semibold">Cancelar</button>
            <button data-testid={`${testId}-confirm`} disabled={!ok || pending} className="rounded-full bg-semantic-error px-4 py-2 font-semibold text-white disabled:opacity-50">Excluir definitivamente</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
