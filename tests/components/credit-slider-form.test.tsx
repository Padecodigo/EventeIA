// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/creditos/actions", () => ({
  buyCreditsAction: vi.fn(),
}));

import { CreditSliderForm } from "@/components/domain/credit-slider-form";

afterEach(cleanup);

describe("CreditSliderForm — CPF no checkout", () => {
  it("CPF do titular é obrigatório e pode vir pré-preenchido", () => {
    render(<CreditSliderForm defaultCpf="52998224725" />);
    const cpf = screen.getByLabelText("CPF do titular");
    expect(cpf).toBeRequired();
    expect(cpf).toHaveValue("52998224725");
  });
});
