// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SingleEventOffer } from "@/components/domain/single-event-offer";

afterEach(cleanup);

describe("SingleEventOffer — evento avulso no painel", () => {
  it("mostra preço, Pix ou cartão de crédito, cupom e leva ao novo evento", () => {
    render(<SingleEventOffer priceCents={9700} />);
    expect(screen.getByText(/97,00/)).toBeInTheDocument();
    expect(screen.getByText(/Pix ou cartão de crédito/)).toBeInTheDocument();
    expect(screen.getByText(/cupons/i)).toBeInTheDocument();
    expect(screen.queryByText(/débito/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /criar evento avulso/i })).toHaveAttribute(
      "href",
      "/eventos#novo-evento",
    );
  });
});
