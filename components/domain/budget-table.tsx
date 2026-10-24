import type { EngineResult } from "@/lib/engine/types";
import { formatBRL } from "@/lib/money";

const MASKED = "R$ •••";

export interface BudgetTableProps {
  result: EngineResult;
  unlocked: boolean;
}

export function BudgetTable({ result, unlocked }: BudgetTableProps) {
  const visibleLines = unlocked ? result.breakdown : result.breakdown.slice(0, 3);

  return (
    <section className="rounded-card border border-line-subtle bg-off-white shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-6 py-5">
        <div>
          <h2 className="font-serif text-title-1">Orçamento estimado</h2>
          <p className="mt-1 text-caption text-vinho/70">
            Motor determinístico · versão {result.engineVersion} · valores em BRL
          </p>
        </div>
        <span className="rounded-pill bg-areia-secundaria px-3 py-1 text-caption text-vinho/70">
          {unlocked ? "Liberado" : "Prévia"}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-overline uppercase tracking-[0.12em] text-vinho/70">
              <th className="px-6 py-3 font-medium">Categoria</th>
              <th className="px-6 py-3 text-right font-medium">Mínimo</th>
              <th className="px-6 py-3 text-right font-medium">Sugerido</th>
              <th className="px-6 py-3 text-right font-medium">Teto</th>
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line) => (
              <tr key={line.category} className="border-t border-line-subtle even:bg-areia-quente/60">
                <td className="px-6 py-3 text-vinho">{line.label}</td>
                <td className="px-6 py-3 text-right tabular-nums text-vinho/80">
                  {unlocked ? formatBRL(line.minCents) : MASKED}
                </td>
                <td className="px-6 py-3 text-right tabular-nums font-medium text-vinho">
                  {unlocked ? formatBRL(line.suggestedCents) : MASKED}
                </td>
                <td className="px-6 py-3 text-right tabular-nums text-vinho/80">
                  {unlocked ? formatBRL(line.maxCents) : MASKED}
                </td>
              </tr>
            ))}
            <tr className="border-t border-champagne/60 bg-areia-quente">
              <td className="px-6 py-4 font-serif text-title-3" colSpan={3}>
                Total estimado
              </td>
              <td className="px-6 py-4 text-right font-serif text-title-2 tabular-nums">
                {unlocked ? formatBRL(result.totalCents) : MASKED}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {result.warnings.length > 0 ? (
        <div className="border-t border-line-subtle px-6 py-4">
          <ul className="space-y-1 text-caption text-vinho/75">
            {result.warnings.map((warning) => (
              <li key={warning.code}>• {warning.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!unlocked ? (
        <p className="border-t border-line-subtle bg-champagne-claro/25 px-6 py-4 text-sm text-vinho/75">
          A prévia mostra 3 categorias. Compre o tíquete do evento para liberar o orçamento completo,
          as cotações ilimitadas e os disparos.
        </p>
      ) : null}
    </section>
  );
}
