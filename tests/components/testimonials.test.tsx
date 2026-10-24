// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it } from "vitest";

import { Testimonials } from "@/components/marketing/testimonials";

afterEach(cleanup);

const realItem = {
  id: "real-1",
  initials: "AS",
  name: "Ana Souza",
  context: "Festa de 1 aninho do Theo · 40 convidados",
  city: "Campinas, SP",
  quote:
    "Consegui organizar a festa do Theo sem virar noites em planilhas. As propostas chegaram organizadas.",
  outcome: "3 propostas em 48 horas",
  tone: "vinho" as const,
};

describe("Testimonials", () => {
  it("sem casos reais, exibe as personas do conceito", () => {
    render(<Testimonials />);

    expect(screen.getByText("Camila Rezende")).toBeInTheDocument();
    expect(screen.getByText("Débora Nunes")).toBeInTheDocument();
  });

  it("com casos reais, substitui as personas", () => {
    render(<Testimonials items={[realItem]} />);

    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.queryByText("Camila Rezende")).not.toBeInTheDocument();
  });

  it("exibe o resultado concreto do depoimento real", () => {
    render(<Testimonials items={[realItem]} />);

    expect(screen.getByText(/3 propostas em 48 horas/i)).toBeInTheDocument();
  });
});
