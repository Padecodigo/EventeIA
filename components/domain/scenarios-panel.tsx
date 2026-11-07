import Link from "next/link";

import { CATEGORY_LABELS, type CategoryCode } from "@/lib/catalog/v1";
import type { ScenarioKind } from "@/lib/engine/types";
import { formatBRL } from "@/lib/money";
import {
  SCENARIO_LABELS,
  SCENARIO_SLUGS,
  type ScenarioSnapshotBreakdown,
} from "@/lib/quotes/scenarios";

function label(category: string): string {
  return CATEGORY_LABELS[category as CategoryCode] ?? category;
}

/** O orçamento único de menor preço montado com as cotações reais recebidas. */
export function ScenariosPanel({
  eventId,
  scenarios,
}: {
  eventId: string;
  scenarios: Partial<Record<ScenarioKind, ScenarioSnapshotBreakdown>>;
}) {
  const snap = scenarios.preco;
  if (snap === undefined) return null;
  const scenario = snap.outcome.scenario;
  const uncovered = snap.uncovered;
  const pending = [
    ...new Set([...uncovered, ...snap.outcome.missing.flatMap((info) => info.category.split("+"))]),
  ];
  const complete = scenario !== null && scenario.selections.length > 0 && uncovered.length === 0;

  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <h2 className="font-serif text-title-1">Seu orçamento</h2>
      <p className="mt-1 text-sm text-vinho/75">
        Montado com as cotações reais que os fornecedores enviaram.
      </p>
      <article className="mt-6 flex max-w-2xl flex-col gap-3 rounded-card border border-line-subtle bg-areia-secundaria/40 p-5">
        <header>
          <h3 className="font-serif text-title-2">
            {complete ? SCENARIO_LABELS.preco : "Orçamento incompleto"}
          </h3>
          <p className="text-caption text-vinho/70">
            {complete
              ? "Menor custo total entre as propostas comparáveis, já com as taxas obrigatórias."
              : "Ainda não há cotações válidas para todas as necessidades."}
          </p>
        </header>
        {complete ? (
          <>
            <p className="font-serif text-title-1 text-primaria">
              {formatBRL(scenario.totalCents)}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {scenario.selections.map((s) => (
                <li key={s.supplierId} className="flex justify-between gap-2">
                  <span>
                    {s.supplierName}{" "}
                    <span className="text-vinho/60">· {s.categories.map(label).join(", ")}</span>
                  </span>
                  <span className="tabular-nums">{formatBRL(s.effectiveCents)}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/eventos/${eventId}/orcamento/${SCENARIO_SLUGS.preco}/imprimir`}
              className="mt-auto text-sm font-semibold text-primaria hover:underline"
            >
              Imprimir / PDF
            </Link>
          </>
        ) : (
          <p className="text-sm text-vinho/75">
            {pending.length > 0 ? `Falta cotação válida em ${pending.map(label).join(", ")}.` : ""}
            Não é possível afirmar o menor preço enquanto faltarem dados comparáveis.
          </p>
        )}
      </article>
    </section>
  );
}
