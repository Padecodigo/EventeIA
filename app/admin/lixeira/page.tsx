import { PURGE_BLOCKED, SUPPLIER_IN_USE_REASON, TRASH_KINDS, type TrashKind } from "@/lib/admin/trash";
import { requireAdmin } from "@/lib/auth";
import { PROVIDER_LABELS } from "@/lib/finance/load";
import { formatBRL } from "@/lib/money";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card, fmtDate } from "../ui";
import { restoreAction } from "./actions";
import { PurgeButton } from "./purge-controls";

export const dynamic = "force-dynamic";

interface Item { id: string; text: string; deletedAt: string }

function RestoreButton({ kind, ids, label }: { kind: TrashKind; ids: string[]; label: string }) {
  return (
    <form action={restoreAction}>
      <input type="hidden" name="kind" value={kind} />
      {ids.map((id) => <input key={id} type="hidden" name="id" value={id} />)}
      <button type="submit" className="rounded-full border border-primaria px-3 py-1 text-caption font-semibold text-primaria">{label}</button>
    </form>
  );
}

export default async function AdminLixeiraPage() {
  await requireAdmin();
  const admin = getSupabaseAdmin();
  const L = 200;
  const [costs, llm, alerts, tickets, suppliers] = await Promise.all([
    admin.from("cost_entries").select("id,provider,kind,note,cost_brl_cents,occurred_at,deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(L),
    admin.from("llm_usage_events").select("id,provider,task,cost_brl_cents,created_at,deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(L),
    admin.from("finance_alerts").select("id,provider,kind,balance_brl_cents,created_at,deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(L),
    admin.from("support_tickets").select("id,subject,status,created_at,deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(L),
    admin.from("suppliers").select("id,name,category,city,deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(L),
  ]);
  const p = (x: string) => PROVIDER_LABELS[x] ?? x;
  const sections: Record<TrashKind, Item[]> = {
    custos: (costs.data ?? []).map((r) => ({ id: r.id, deletedAt: r.deleted_at ?? "", text: `${r.kind === "fixed" ? "Fixo" : "Variável"} · ${p(r.provider)} · ${formatBRL(r.cost_brl_cents)} · ${fmtDate(r.occurred_at)}${r.note ? ` · ${r.note}` : ""}` })),
    ia: (llm.data ?? []).map((r) => ({ id: r.id, deletedAt: r.deleted_at ?? "", text: `${p(r.provider)} · ${r.task} · ${formatBRL(r.cost_brl_cents ?? 0)} · ${fmtDate(r.created_at)}` })),
    alertas: (alerts.data ?? []).map((r) => ({ id: r.id, deletedAt: r.deleted_at ?? "", text: `${p(r.provider)} · ${r.kind === "low_balance" ? "saldo baixo" : r.kind === "low_runway" ? "fôlego curto" : r.kind} · ${r.balance_brl_cents === null ? "" : formatBRL(r.balance_brl_cents)} · ${fmtDate(r.created_at)}` })),
    chamados: (tickets.data ?? []).map((r) => ({ id: r.id, deletedAt: r.deleted_at ?? "", text: `${r.subject} · ${r.status} · ${fmtDate(r.created_at)}` })),
    fornecedores: (suppliers.data ?? []).map((r) => ({ id: r.id, deletedAt: r.deleted_at ?? "", text: `${r.name} · ${r.category} · ${r.city ?? "sem cidade"}` })),
  };
  const total = Object.values(sections).reduce((n, items) => n + items.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-serif text-title-2">Lixeira</h2>
        <p className="text-caption text-vinho/60">Tudo o que foi excluído no admin fica guardado aqui. Toque em “Restaurar” para devolver o item à tela de origem. “Excluir definitivamente” e “Esvaziar lixeira” apagam de verdade e não têm volta. Custos (registros fiscais, guardados por 5 anos) e fornecedores já contatados em eventos nunca são apagados definitivamente. Mostra até {L} itens por seção.</p>
        {total > 0 ? (
          <div className="mt-3 flex justify-end">
            <PurgeButton kind="all" scope="all" testId="lixeira-esvaziar" label="Esvaziar lixeira" title={`Esvaziar a lixeira (${total} itens)?`}
              items={[]} warning={`Serão apagados definitivamente todos os itens das seções. ${PURGE_BLOCKED.custos ?? ""} ${SUPPLIER_IN_USE_REASON}`} />
          </div>
        ) : null}
      </header>
      {(Object.keys(TRASH_KINDS) as TrashKind[]).map((k) => {
        const items = sections[k];
        return (
          <Card key={k} testId={`lixeira-${k}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-serif text-title-3">{TRASH_KINDS[k].label} ({items.length})</h3>
              {items.length > 1 ? <RestoreButton kind={k} ids={items.map((i) => i.id)} label="Restaurar todos" /> : null}
            </div>
            {PURGE_BLOCKED[k] && items.length ? <p className="mt-1 text-caption text-vinho/60" data-testid={`purge-blocked-${k}`}>Não dá para excluir definitivamente: {PURGE_BLOCKED[k]}</p> : null}
            {items.length === 0 ? <p className="text-caption text-vinho/70">Nada na lixeira.</p> : (
              <ul className="mt-2 text-sm">{items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle py-1">
                  <span>{i.text} <span className="text-caption text-vinho/50">excluído em {fmtDate(i.deletedAt)}</span></span>
                  <span className="flex flex-wrap items-start gap-2">
                    <RestoreButton kind={k} ids={[i.id]} label="Restaurar" />
                    {PURGE_BLOCKED[k] ? null : (
                      <PurgeButton kind={k} ids={[i.id]} testId={`purge-${k}-${i.id}`} label="Excluir definitivamente" title="Excluir definitivamente este item?" items={[i.text]}
                        warning={k === "fornecedores" ? SUPPLIER_IN_USE_REASON : undefined} />
                    )}
                  </span>
                </li>))}</ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
