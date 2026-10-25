// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/creditos/actions", () => ({ subscribeToPlanAction: vi.fn() }));

import { SubscribePlanForm } from "@/components/domain/subscribe-plan-form";

afterEach(cleanup);

describe("SubscribePlanForm", () => {
  it("pergunta se renova todo mês e oferece Pix ou cartão de crédito", () => {
    render(
      <SubscribePlanForm
        planCode="atelier"
        planName="Atelier"
        credits={10}
        priceFormatted="R$ 1"
      />,
    );
    expect(screen.getByText("Renovar automaticamente todo mês?")).toBeInTheDocument();
    expect(screen.getByLabelText(/Sim, renovar todo mês/)).toBeRequired();
    expect(screen.getByLabelText(/Não, compra única/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pix/ })).toHaveAttribute("value", "pix");
    expect(screen.getByRole("button", { name: /cartão de crédito/ })).toHaveAttribute(
      "value",
      "card",
    );
    expect(screen.queryByText(/débito/i)).not.toBeInTheDocument();
  });
});
