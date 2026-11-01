import { formatBRL } from "@/lib/money";
import type { EventCoverageRow } from "@/lib/prospecting/coverage-gaps";
import { SCOPE_LABELS, type ScopeItem } from "@/lib/quotes/scope-items";

const STATUS: Record<EventCoverageRow["coverage"], string> = {
  included: "Incluso",
  excluded: "Não incluso",
  optional_extra: "Extra opcional",
  unknown: "Em confirmação",
};

function label(item: string): string {
  return SCOPE_LABELS[item as ScopeItem] ?? item;
}

function status(row: EventCoverageRow): string {
  if (row.aConfirmar) return "A confirmar (não contado como incluso)";
  if (row.coverage === "optional_extra" && row.extraPriceCents !== null) return `Extra: ${formatBRL(row.extraPriceCents)}`;
  return STATUS[row.coverage];
}

/** O que cada cotação recebida inclui no preço. Sem dados do fornecedor. */
export function CoveragePanel({ rows }: { rows: EventCoverageRow[] }) {
  if (rows.length === 0) return null;
  const quotes = [...new Set(rows.map((r) => r.quoteLabel))];
  return (
    <section aria-labelledby="coverage-title" className="rounded-2xl border border-line-strong p-4">
      <h2 id="coverage-title" className="font-serif text-title-3 text-vinho">
        O que está incluso nas cotações
      </h2>
      {quotes.map((quote) => (
        <div key={quote} className="mt-3">
          <h3 className="text-body font-medium text-vinho">{quote}</h3>
          <ul className="mt-1 grid gap-1 text-caption text-vinho/80">
            {rows
              .filter((r) => r.quoteLabel === quote)
              .map((r) => (
                <li key={r.itemCode}>
                  {label(r.itemCode)}: {status(r)}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
