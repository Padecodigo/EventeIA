// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/perfil/history-actions", () => ({
  deleteEventHistoryAction: vi.fn(),
  undoEventDeletionAction: vi.fn(),
}));

import { EventHistoryDeletion } from "@/components/domain/event-history-deletion";

afterEach(cleanup);

const closed = [{ id: "e1", title: "Aniversário 2025", dateLabel: "10/09/2025", statusLabel: "Encerrado" }];

describe("EventHistoryDeletion", () => {
  it("modal só habilita com APAGAR digitado", () => {
    render(<EventHistoryDeletion closedEvents={closed} deletedEvents={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    const dialog = screen.getByTestId("history-delete-dialog");
    expect(dialog).toHaveTextContent("Registros financeiros obrigatórios");
    const submit = screen.getByRole("button", { name: /apagar definitivamente/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/digite apagar/i), { target: { value: "APAGA" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/digite apagar/i), { target: { value: "APAGAR" } });
    expect(submit).toBeEnabled();
  });

  it("lista apagados com Desfazer e sem histórico mostra vazio", () => {
    render(
      <EventHistoryDeletion
        closedEvents={[]}
        deletedEvents={[{ id: "e2", title: "Casamento", purgeAfterLabel: "30/11/2026" }]}
      />,
    );
    expect(screen.getByText(/nenhum evento encerrado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    expect(screen.getByText(/30\/11\/2026/)).toBeInTheDocument();
  });
});
