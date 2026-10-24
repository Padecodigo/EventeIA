import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/domain/print-button";
import { formatBRL } from "@/lib/money";
import { categoryLabel, scenarioLines } from "@/lib/quotes/export";

import { loadScenario } from "../load";

export const metadata = { title: "Orçamento para impressão" };

export default async function PrintScenarioPage({
  params,
}: {
  params: Promise<{ id: string; cenario: string }>;
}) {
  const { id, cenario } = await params;
  const data = await loadScenario(id, cenario);
  if (data === null) notFound();
  const lines = scenarioLines(data.snap);
  const total = data.snap.outcome.scenario?.totalCents ?? 0;

  return (
    <article className="mx-auto max-w-3xl bg-off-white p-8 text-vinho print:p-0 print:shadow-none">
      <div className="mb-6 flex gap-4 print:hidden">
        <PrintButton />
        <Link
          href={`/eventos/${id}/orcamento/${cenario}/csv`}
          className="text-sm font-semibold text-primaria hover:underline"
        >
          Baixar CSV
        </Link>
        <Link href={`/eventos/${id}`} className="text-sm text-vinho/70 hover:underline">
          Voltar ao evento
        </Link>
      </div>
      <p className="text-overline uppercase tracking-[0.14em] text-vinho/70">
        EventeIA · Orçamento
      </p>
      <h1 className="mt-1 font-serif text-title-1">{data.title}</h1>
      <p className="text-sm text-vinho/75">
        {data.snap.label}
        {data.eventDate
          ? ` · ${new Date(`${data.eventDate}T12:00:00`).toLocaleDateString("pt-BR")}`
          : ""}
      </p>
      {lines.length === 0 ? (
        <p className="mt-6">Cotações insuficientes para este cenário.</p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-left">
              <th className="py-2">Fornecedor</th>
              <th>Categorias</th>
              <th>Contato</th>
              <th className="text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr
                key={`${l.supplierName}-${l.categories.join()}`}
                className="border-b border-line-subtle/60"
              >
                <td className="py-2">
                  {l.supplierName}
                  {l.includes.length > 0 ? (
                    <span className="block text-caption text-vinho/75">
                      Inclui: {l.includes.join(", ")}
                    </span>
                  ) : null}
                  {l.excludes.length > 0 ? (
                    <span className="block text-caption text-vinho/75">
                      Não inclui: {l.excludes.join(", ")}
                    </span>
                  ) : null}
                  {l.notes.map((n) => (
                    <span key={n} className="block text-caption text-vinho/75">
                      {n}
                    </span>
                  ))}
                </td>
                <td>{l.categories.join(", ")}</td>
                <td>{l.contact ?? "—"}</td>
                <td className="text-right tabular-nums">{formatBRL(l.effectiveCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-3 font-semibold">
                Total (com taxas obrigatórias)
              </td>
              <td className="text-right font-semibold tabular-nums">{formatBRL(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      {data.snap.uncovered.length > 0 ? (
        <p className="mt-4 text-caption text-vinho/70">
          Não coberto (sem cotação): {data.snap.uncovered.map(categoryLabel).join(", ")}.
        </p>
      ) : null}
      <p className="mt-8 text-caption text-vinho/60">
        Valores informados pelos fornecedores via WhatsApp; confirme diretamente com cada um.
      </p>
    </article>
  );
}
