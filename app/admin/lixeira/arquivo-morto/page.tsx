import Link from "next/link";

import { ARCHIVED_COST_COLUMNS, retentionEndIso, type ArchivedCostRow } from "@/lib/admin/archive";
import { ARCHIVE_RETENTION_YEARS } from "@/lib/admin/trash";
import { requireAdmin } from "@/lib/auth";
import { PROVIDER_LABELS } from "@/lib/finance/load";
import { formatBRL } from "@/lib/money";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card, READ_ONLY_NOTE, fmtDate } from "../../ui";

export const dynamic = "force-dynamic";

/** Arquivo morto (dentro da Lixeira, sem aba própria): custos arquivados e fornecedores anonimizados. Somente leitura. */
export default async function ArquivoMortoPage() {
  await requireAdmin();
  const admin = getSupabaseAdmin();
  const L = 500;
  const [costs, suppliers] = await Promise.all([
    admin.from("cost_entries").select(ARCHIVED_COST_COLUMNS).not("archived_at", "is", null).order("archived_at", { ascending: false }).limit(L),
    admin.from("suppliers").select("id,name,category,city,anonymized_at").not("anonymized_at", "is", null).order("anonymized_at", { ascending: false }).limit(L),
  ]);
  const rows = (costs.data ?? []) as unknown as ArchivedCostRow[];
  const sups = suppliers.data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/admin/lixeira" className="text-caption font-semibold text-primaria">← Voltar para a Lixeira</Link>
        <h2 className="mt-1 font-serif text-title-2">Arquivo morto</h2>
        <p className="text-caption text-vinho/60">{READ_ONLY_NOTE} Custos são guardados {ARCHIVE_RETENTION_YEARS} anos (obrigação fiscal) e depois apagados automaticamente. Mostra até {L} itens por seção.</p>
      </header>
      <Card testId="arquivo-custos">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-title-3">Custos arquivados ({rows.length})</h3>
          {rows.length ? <a href="/admin/lixeira/arquivo-morto/csv" data-testid="arquivo-csv" className="rounded-full border border-primaria px-3 py-1 text-caption font-semibold text-primaria">Exportar CSV (fiscal)</a> : null}
        </div>
        {rows.length === 0 ? <p className="text-caption text-vinho/70">Nenhum custo arquivado.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-caption text-vinho/60"><tr><th>Data do custo</th><th>Provedor</th><th>Tipo</th><th>Valor</th><th>Nota</th><th>Arquivado em</th><th>Guardar até</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="border-t border-line-subtle">
                  <td>{fmtDate(r.occurred_at)}</td><td>{PROVIDER_LABELS[r.provider] ?? r.provider}</td>
                  <td>{r.kind === "fixed" ? "Fixo" : "Variável"}</td><td>{formatBRL(r.cost_brl_cents)}</td>
                  <td>{r.note ?? ""}</td><td>{fmtDate(r.archived_at)}</td><td>{fmtDate(retentionEndIso(r))}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <Card testId="arquivo-fornecedores">
        <h3 className="font-serif text-title-3">Fornecedores anonimizados ({sups.length})</h3>
        <p className="text-caption text-vinho/60">Nome e contatos foram apagados de forma irreversível; a linha fica só para manter o histórico dos eventos dos clientes.</p>
        {sups.length === 0 ? <p className="text-caption text-vinho/70">Nenhum fornecedor anonimizado.</p> : (
          <ul className="mt-2 text-sm">{sups.map((s) => <li key={s.id} className="border-t border-line-subtle py-1">{s.name} · {s.category} · {s.city ?? "sem cidade"} <span className="text-caption text-vinho/50">anonimizado em {fmtDate(s.anonymized_at)}</span></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
