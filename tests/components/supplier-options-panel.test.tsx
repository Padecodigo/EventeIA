// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

// A action vive em "use server" com cadeia server-only — mock do módulo.
vi.mock("@/app/(dashboard)/eventos/[id]/selection-actions", () => ({
  selectSupplierOptionAction: vi.fn(async () => ({})),
}));

import {
  SupplierOptionsPanel,
  type SupplierOptionsRowView,
} from "@/components/domain/supplier-options-panel";

afterEach(cleanup);

function rows(): SupplierOptionsRowView[] {
  return [
    {
      supplierId: "supplier-1",
      supplierName: "Buffet do Vale",
      categoryLabel: "Buffet",
      selectedOptionId: null,
      status: null,
      options: [
        {
          optionId: "opt-1",
          name: "Churrasco completo",
          description: "Carnes, acompanhamentos e sobremesa.",
          priceFormatted: "R$ 89,00 por pessoa",
          unitLabel: "por pessoa",
        },
        {
          optionId: "opt-2",
          name: "Jantar completo",
          description: "Serviço à francesa com 3 pratos.",
          priceFormatted: "R$ 120,00 por pessoa",
          unitLabel: "por pessoa",
        },
      ],
    },
  ];
}

describe("SupplierOptionsPanel — nenhuma opção é pré-selecionada", () => {
  it("mostra as opções lado a lado com preço para comparação", () => {
    render(<SupplierOptionsPanel eventId="evt" rows={rows()} />);

    expect(screen.getByText("Churrasco completo")).toBeInTheDocument();
    expect(screen.getByText("Jantar completo")).toBeInTheDocument();
    expect(screen.getByText("R$ 89,00 por pessoa")).toBeInTheDocument();
    expect(screen.getByText("R$ 120,00 por pessoa")).toBeInTheDocument();
  });

  it("não marca nenhuma opção como escolhida por padrão", () => {
    const { container } = render(<SupplierOptionsPanel eventId="evt" rows={rows()} />);

    expect(screen.queryByText("Escolhida")).toBeNull();
    expect(container.querySelectorAll('[checked], [aria-checked="true"], input[type="radio"], input[type="checkbox"]')).toHaveLength(0);
  });

  it("não exibe marcação de 'recomendado' ou auto-seleção", () => {
    render(<SupplierOptionsPanel eventId="evt" rows={rows()} />);

    expect(screen.queryByText(/recomendad/i)).toBeNull();
    expect(screen.getByText(/nenhuma opção é pré-selecionada/i)).toBeInTheDocument();
  });

  it("exige ação explícita: cada opção tem botão Escolher", () => {
    render(<SupplierOptionsPanel eventId="evt" rows={rows()} />);

    expect(screen.getAllByRole("button", { name: "Escolher" })).toHaveLength(2);
  });

  it("marca a opção já escolhida (escolha prévia do usuário)", () => {
    render(
      <SupplierOptionsPanel
        eventId="evt"
        rows={[{ ...rows()[0], selectedOptionId: "opt-1" }]}
      />,
    );

    expect(screen.getByText("Escolhida")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Escolher" })).toHaveLength(1);
  });
});
