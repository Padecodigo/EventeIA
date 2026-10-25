// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/custos/actions", () => ({
  addFixedCostBrlAction: vi.fn(), checkBalancesNowAction: vi.fn(), softDeleteAction: vi.fn(), updateBalanceAction: vi.fn(), updateFixedCostAction: vi.fn(),
}));
vi.mock("@/app/admin/financeiro/actions", () => ({ clearCostPeriodAction: vi.fn(), deleteCostRowsAction: vi.fn() }));
vi.mock("@/app/admin/chamados/actions", () => ({ adminCloseTicketAction: vi.fn(), adminReopenTicketAction: vi.fn(), adminDeleteTicketAction: vi.fn() }));

import { CloseControls } from "@/app/admin/chamados/close-controls";
import { AddFixedCost, BalanceForm } from "@/app/admin/custos/forms";
import { ClearCostPeriod } from "@/app/admin/financeiro/delete-controls";

afterEach(cleanup);

describe("novos controles do admin", () => {
  it("VPS: campos de vencimento e valor mensal (padrão R$ 100)", () => {
    render(<BalanceForm provider="vps" manual budget={false} budgetCents={null} balanceCents={null} thresholdCents={5000} runwayDays={7} note={null} renewal={{ date: null, monthlyCents: null }} />);
    expect(screen.getByLabelText("Próximo vencimento")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Valor mensal (R$)")).toHaveValue("100,00");
  });
  it("Adicionar custo fixo: campos com rótulo e opção repete todo mês", () => {
    render(<AddFixedCost month="2026-10" />);
    expect(screen.getByLabelText("Ferramenta / nome")).toBeInTheDocument();
    expect(screen.getByLabelText("Valor (R$)")).toBeRequired();
    expect(screen.getByLabelText("Mês de referência")).toHaveValue("2026-10");
    expect(screen.getByLabelText(/Repete todo mês/)).toHaveAttribute("type", "checkbox");
  });
  it("Limpar custos: modal mostra quantos itens por provedor", () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    render(<ClearCostPeriod from="2026-10-01" to="2026-10-31" counts={{ serper: 3, deepseek: 2 }} labels={{ serper: "Serper" }} />);
    fireEvent.click(screen.getByTestId("clear-costs"));
    expect(screen.getByTestId("clear-costs-count")).toHaveTextContent("5 lançamento(s)");
    fireEvent.change(screen.getByLabelText(/Provedor/), { target: { value: "serper" } });
    expect(screen.getByTestId("clear-costs-count")).toHaveTextContent("3 lançamento(s)");
  });
  it("Chamado: Encerrar vira Reabrir quando fechado; Excluir abre confirmação", () => {
    const { rerender } = render(<CloseControls ticketId="t" closed={false} subject="Erro" />);
    expect(screen.getByTestId("ticket-close")).toHaveTextContent("Encerrar chamado");
    rerender(<CloseControls ticketId="t" closed subject="Erro" />);
    expect(screen.getByTestId("ticket-reopen")).toHaveTextContent("Reabrir chamado");
    expect(screen.getByTestId("ticket-delete-confirm")).toHaveTextContent("Confirmar exclusão");
  });
});
