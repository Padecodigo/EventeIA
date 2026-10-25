import Link from "next/link";

import { CATEGORY_LABELS, type CategoryCode } from "@/lib/catalog/v1";
import type { ScenarioKind } from "@/lib/engine/types";
import { formatBRL } from "@/lib/money";
import { SCENARIO_KINDS, SCENARIO_LABELS, SCENARIO_SLUGS, type ScenarioSnapshotBreakdown } from "@/lib/quotes/scenarios";

const HINTS: Record<ScenarioKind, string> = {
  preco: "Menor custo total, já com as taxas obrigatórias.",
  custo_beneficio: "Equilíbrio entre preço e a confiança da proposta.",
  comodidade: "Menos fornecedores para você coordenar.",
};

function label(category: string): string {
  return CATEGORY_LABELS[category as CategoryCode] ?? category;
}

/** Os 3 cenários reais montados com as cotações recebidas (fase 4). */
export function ScenariosPanel({
  eventId,
  scenarios,
}: {
  eventId: string;
  scenarios: Partial<Record<ScenarioKind, ScenarioSnapshotBreakdown>>;
}) {
  const any = SCENARIO_KINDS.some((k) => scenarios[k] !== undefined);
  if (!any) return null;
  const uncovered = SCENARIO_KINDS.map((k) => scenarios[k]?.uncovered ?? []).find((u) => u.length > 0) ?? [];

  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <h2 className="font-serif text-title-1">Seus 3 orçamentos</h2>
      <p className="mt-1 text-sm text-vinho/75">Montados com as cotações reais que os fornecedores enviaram.</p>
      {uncovered.length > 0 ? (
        <p className="mt-2 text-caption text-vinho/70">
          Sem cotação aproveitável em: {uncovered.map(label).join(", ")}.
        </p>
      ) : null}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {SCENARIO_KINDS.map((kind) => {
          const snap = scenarios[kind];
          const scenario = snap?.outcome.scenario ?? null;
          return (
            <article key={kind} className="flex flex-col gap-3 rounded-card border border-line-subtle bg-areia-secundaria/40 p-5">
              <header>
                <h3 className="font-serif text-title-2">{SCENARIO_LABELS[kind]}</h3>
                <p className="text-caption text-vinho/70">{HINTS[kind]}</p>
              </header>
              {scenario === null ? (
                <p className="text-sm text-vinho/75">Cotações insuficientes para este cenário.</p>
              ) : (
                <>
                  <p className="font-serif text-title-1 text-primaria">{formatBRL(scenario.totalCents)}</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {scenario.selections.map((s) => (
                      <li key={s.supplierId} className="flex justify-between gap-2">
                        <span>
                          {s.supplierName} <span className="text-vinho/60">· {s.categories.map(label).join(", ")}</span>
                        </span>
                        <span className="tabular-nums">{formatBRL(s.effectiveCents)}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/eventos/${eventId}/orcamento/${SCENARIO_SLUGS[kind]}/imprimir`}
                    className="mt-auto text-sm font-semibold text-primaria hover:underline"
                  >
                    Imprimir / PDF
                  </Link>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
