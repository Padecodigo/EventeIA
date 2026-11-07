// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

// Actions vivem em "use server" com cadeia server-only — mock do módulo.
vi.mock("@/app/(dashboard)/eventos/actions", () => ({
  buyTicketAction: vi.fn(),
}));

import { BuyTicketForm } from "@/components/domain/buy-ticket-form";

afterEach(cleanup);

describe("BuyTicketForm — pagamento do ticket", () => {
  it("CPF continua obrigatório no formulário de pagamento", () => {
    render(<BuyTicketForm eventId="evt" priceFormatted="R$ 97,00" defaultCpf="" />);

    const cpf = screen.getByLabelText("CPF do titular");
    expect(cpf).toBeRequired();
  });

  it("oferece Pix e cartão de crédito (sem boleto)", () => {
    render(<BuyTicketForm eventId="evt" priceFormatted="R$ 97,00" defaultCpf="" />);
    const pix = screen.getByRole("button", { name: /pagar com pix/i });
    const card = screen.getByRole("button", { name: /cartão de crédito/i });
    expect(pix).toHaveAttribute("name", "method");
    expect(pix).toHaveAttribute("value", "pix");
    expect(card).toHaveAttribute("value", "card");
    expect(screen.getByText(/Pix ou cartão de crédito/)).toBeInTheDocument();
    expect(screen.queryByText(/boleto/i)).toBeNull();
  });
});
