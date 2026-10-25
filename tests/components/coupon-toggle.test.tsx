// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/offers", () => ({ requestOfferAction: vi.fn(async () => ({})) }));
vi.mock("@/app/(dashboard)/eventos/actions", () => ({
  applyCouponAction: vi.fn(),
  buyTicketAction: vi.fn(),
}));
vi.mock("@/app/(dashboard)/creditos/actions", () => ({
  applyPackCouponAction: vi.fn(),
  buyCreditsAction: vi.fn(),
  subscribeToPlanAction: vi.fn(),
}));

import { BuyTicketForm } from "@/components/domain/buy-ticket-form";
import { CreditSliderForm } from "@/components/domain/credit-slider-form";
import { SubscribePlanForm } from "@/components/domain/subscribe-plan-form";

afterEach(cleanup);

function expectToggle() {
  const toggle = screen.getByRole("button", { name: "Tem um cupom?" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByLabelText("Código do cupom")).toBeNull();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByLabelText("Código do cupom")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /aplicar cupom/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Quer cupom?" })).toBeInTheDocument();
}

describe("'Tem um cupom?' e 'Quer cupom?' em todos os checkouts", () => {
  it("evento avulso", () => {
    render(<BuyTicketForm eventId="evt" priceFormatted="R$ 97,00" defaultCpf="" />);
    expectToggle();
  });
  it("slider de créditos extras", () => {
    render(<CreditSliderForm />);
    expectToggle();
  });
  it("franquia", () => {
    render(
      <SubscribePlanForm
        planCode="atelier"
        planName="Atelier"
        credits={7}
        priceFormatted="R$ 197,00"
      />,
    );
    expectToggle();
  });
  it("slider mostra a oferta com contagem dd:hh:mm:ss e preço com 30%", () => {
    render(
      <CreditSliderForm
        offer={{
          headline:
            "Oferta de boas-vindas: R$ 40 de desconto no evento avulso ou 30% nos pacotes de créditos",
          remainingMs: (47 * 3600 + 12 * 60 + 5) * 1000,
          avulsoOffCents: 4000,
          packPercent: 30,
        }}
      />,
    );
    expect(screen.getByText("01:23:12:05")).toBeInTheDocument();
    expect(screen.getByText(/Neste pacote: R\$\s?137,90/)).toBeInTheDocument();
  });
});
