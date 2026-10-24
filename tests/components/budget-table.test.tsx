// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it } from "vitest";

import { BudgetTable } from "@/components/domain/budget-table";
import { calculate } from "@/lib/engine";
import { formatBRL } from "@/lib/money";

afterEach(cleanup);

const result = calculate({
  eventType: "festa_infantil",
  guestCount: 60,
  eventDateIso: "2026-12-05",
  leadTimeDays: 40,
  region: "sp",
  items: [
    { category: "buffet" },
    { category: "decoracao" },
    { category: "musica" },
    { category: "fotografia" },
    { category: "espaco" },
  ],
});

const normalized = (text: string | null): string => (text ?? "").replace(/\u00a0/g, " ");

describe("BudgetTable", () => {
  it("bloqueado: valores mascarados e selo de prévia", () => {
    render(<BudgetTable result={result} unlocked={false} />);

    expect(screen.getByText("Prévia")).toBeInTheDocument();
    const masked = screen.getAllByText("R$ •••");
    expect(masked.length).toBeGreaterThanOrEqual(result.breakdown.length);
  });

  it("liberado: mostra o total e as linhas do breakdown", () => {
    render(<BudgetTable result={result} unlocked={true} />);

    expect(screen.getByText("Liberado")).toBeInTheDocument();
    expect(screen.getByText("Buffet")).toBeInTheDocument();

    const expectedTotal = formatBRL(result.totalCents);
    const matches = screen.getAllByText(
      (_, element) => normalized(element?.textContent ?? "") === normalized(expectedTotal),
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it("sinaliza aviso de urgência quando o lead time é curto", () => {
    const urgent = calculate({
      eventType: "festa_infantil",
      guestCount: 60,
      eventDateIso: "2026-12-05",
      leadTimeDays: 5,
      region: "sp",
      items: [{ category: "buffet" }],
    });

    render(<BudgetTable result={urgent} unlocked={true} />);

    expect(screen.getByText(/urgência/i)).toBeInTheDocument();
  });
});
