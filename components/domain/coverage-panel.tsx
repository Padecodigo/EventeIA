import { formatBRL } from "@/lib/money";
import { freeItemStatus, type EventCoverageRow } from "@/lib/prospecting/coverage-gaps";
import { coverageLabel } from "@/lib/prospecting/coverage-loop";

const STATUS: Record<EventCoverageRow["coverage"], string> = {
  included: "Incluso",
  excluded: "Não incluso",
  optional_extra: "Extra opcional",
  unknown: "Em confirmação",
};

function status(row: EventCoverageRow): string {
  if (row.aConfirmar) return "A confirmar (não contado como incluso)";
  if (row.coverage === "optional_extra" && row.extraPriceCents !== null)
    return `Extra: ${formatBRL(row.extraPriceCents)}`;
  return STATUS[row.coverage];
}

/** O que cada cotação recebida inclui no preço. Sem dados do fornecedor. */
export function CoveragePanel({
  rows,
  freeItems = [],
}: {
  rows: EventCoverageRow[];
  freeItems?: { code: string; label: string; category: string }[];
}) {
  if (rows.length === 0 && freeItems.length === 0) return null;
  const quotes = [...new Set(rows.map((r) => r.quoteLabel))];
  const label = (item: string) => coverageLabel(item, freeItems);
  const own = freeItemStatus(freeItems, rows);
  return (
    <section aria-labelledby="coverage-title" className="rounded-2xl border border-line-strong p-4">
      <h2 id="coverage-title" className="font-serif text-title-3 text-vinho">
        O que está incluso nas cotações
      </h2>
      {own.length > 0 ? (
        <div className="mt-3">
          <h3 className="text-body font-medium text-vinho">Seus itens adicionais</h3>
          <ul className="mt-1 grid gap-1 text-caption text-vinho/80">
            {own.map((f) => (
              <li key={f.code}>
                {f.label}:{" "}
                {f.covered
                  ? "Encontrado em cotação"
                  : f.missing
                    ? "Ainda sem fornecedor — seguimos procurando"
                    : "Procurando"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
