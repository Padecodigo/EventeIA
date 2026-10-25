// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/custos/actions", () => ({
  checkBalancesNowAction: vi.fn(), softDeleteAction: vi.fn(), updateBalanceAction: vi.fn(), updateFixedCostAction: vi.fn(),
}));

import { BalanceForm, ConfirmDelete, FixedCostEdit } from "@/app/admin/custos/forms";

afterEach(cleanup);

describe("formulários de saldos/custos fixos", () => {
  it("rótulos visíveis e dica ligada a cada campo (manual)", () => {
    render(<BalanceForm provider="resend" manual budget={false} budgetCents={null} balanceCents={1000} thresholdCents={5000} runwayDays={7} note={null} />);
    for (const l of ["Saldo atual (R$)", "Alertar abaixo de (R$)", "Fôlego mínimo (dias)", "Observação"]) {
      const input = screen.getByLabelText(l);
      expect(input).toHaveAttribute("aria-describedby");
      expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBeTruthy();
    }
    expect(screen.getByLabelText("Fôlego mínimo (dias)")).toHaveAttribute("inputmode", "numeric");
  });
  it("orçamento mensal para provedor sem API", () => {
    render(<BalanceForm provider="google_places" manual={false} budget budgetCents={10000} balanceCents={null} thresholdCents={5000} runwayDays={7} note={null} />);
    expect(screen.getByLabelText("Orçamento mensal (R$)")).toHaveValue("100,00");
    expect(screen.queryByLabelText("Saldo atual (R$)")).toBeNull();
  });
  it("custo fixo: valor e observação com rótulo", () => {
    render(<FixedCostEdit id="x" cents={5000} note="fatura" />);
    expect(screen.getByLabelText("Valor (R$)")).toHaveValue("50,00");
    expect(screen.getByLabelText("Observação")).toHaveValue("fatura");
  });
  it("Excluir abre modal listando o que será apagado, com Cancelar e Confirmar", () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
    render(<ConfirmDelete target="fixed" testId="del" label="Limpar histórico" title="Excluir?" items={[{ id: "a", label: "2026-10 · VPS · R$ 50,00" }, { id: "b", label: "2026-10 · Supabase" }]} />);
    fireEvent.click(screen.getByTestId("del"));
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(screen.getByText("2026-10 · VPS · R$ 50,00")).toBeInTheDocument();
    expect(screen.getByText(/2 item/)).toBeInTheDocument();
    expect(document.querySelectorAll('input[name="id"]')).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Confirmar exclusão", hidden: true })).toBeInTheDocument();
  });
  it("sem itens não mostra botão", () => {
    const { container } = render(<ConfirmDelete target="alert" label="Limpar histórico" title="x" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
