// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/eventos/[id]/actions", () => ({
  updateBudgetLimitAction: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/app/(dashboard)/eventos/[id]/selection-actions", () => ({
  selectSupplierOptionAction: vi.fn(() => Promise.resolve({})),
}));

import { EventBudgetLimitEditor } from "@/components/domain/event-budget-limit-editor";
import { SupplierOptionsPanel } from "@/components/domain/supplier-options-panel";

afterEach(cleanup);

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

describe("EventBudgetLimitEditor", () => {
  it("mostra o limite, abre a edição com o valor atual e lista o histórico", () => {
    render(
      <EventBudgetLimitEditor
        eventId={EVENT_ID}
        budgetLimitCents={2_500_000}
        limitLabel="R$ 25.000,00"
        canEdit
        aboveLimitCount={2}
        history={[{ id: "h1", changedAtLabel: "31/10/2026 13:10", oldLabel: "sem limite", newLabel: "R$ 25.000,00", sourceLabel: "você" }]}
      />,
    );
    expect(screen.getByTestId("budget-limit-value")).toHaveTextContent("R$ 25.000,00");
    expect(screen.getByText("2 opções estão acima do seu limite.")).toBeInTheDocument();
    expect(screen.getByTestId("budget-limit-history")).toHaveTextContent("sem limite → R$ 25.000,00 (você)");
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Novo orçamento limite (R$)")).toHaveValue("25.000,00");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Novo orçamento limite (R$)")).toBeNull();
  });

  it("quem não é dono/admin não vê o botão Editar", () => {
    render(
      <EventBudgetLimitEditor eventId={EVENT_ID} budgetLimitCents={null} limitLabel="Sem limite definido" canEdit={false} aboveLimitCount={0} history={[]} />,
    );
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.getByTestId("budget-limit-value")).toHaveTextContent("Sem limite definido");
  });
});

describe("opções acima do limite", () => {
  it("são sinalizadas, nunca escondidas, e nada é pré-selecionado", () => {
    render(
      <SupplierOptionsPanel
        eventId={EVENT_ID}
        rows={[
          {
            supplierId: "s1",
            supplierName: "Buffet do Vale",
            categoryLabel: "Buffet",
            selectedOptionId: null,
            status: null,
            options: [
              { optionId: "o1", name: "Churrasco", description: null, priceFormatted: "R$ 89,00", unitLabel: "por pessoa", aboveLimit: true },
              { optionId: "o2", name: "Massas", description: null, priceFormatted: "R$ 49,00", unitLabel: "por pessoa", aboveLimit: false },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("Churrasco")).toBeInTheDocument();
    expect(screen.getByText("Massas")).toBeInTheDocument();
    expect(screen.getAllByTestId("above-limit-badge")).toHaveLength(1);
    expect(screen.getByTestId("above-limit-badge")).toHaveTextContent("acima do seu limite");
    expect(screen.getAllByRole("button", { name: "Escolher" })).toHaveLength(2);
    expect(screen.queryByText("Escolhida")).toBeNull();
  });
});
