// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  signInWithGoogleAction: vi.fn(),
}));
vi.mock("@/app/(dashboard)/creditos/actions", () => ({
  subscribeToPlanAction: vi.fn(),
  applyPackCouponAction: vi.fn(),
}));

import { AuthForm } from "@/components/auth/auth-form";
import { SubscribePlanForm } from "@/components/domain/subscribe-plan-form";
import { SiteFooter } from "@/components/site-footer";

afterEach(cleanup);

const terms = () => screen.getByRole("checkbox", { name: /Li e aceito/ });

describe("checkbox de aceite no /registrar", () => {
  it("bloqueia Google e e-mail até marcar os termos (sem etapa de Instagram)", () => {
    render(<AuthForm mode="registrar" />);
    const google = screen.getByRole("button", { name: /Criar conta com Google/ });
    const email = screen.getByRole("button", { name: /Criar conta com e-mail/ });
    expect(google).toBeDisabled();
    expect(email).toBeDisabled();
    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute(
      "href",
      "/privacidade",
    );
    // Só o aceite dos termos destrava o cadastro — não há etapa de seguir/DM no Instagram.
    expect(screen.queryByText(/Já sigo @eventeia/)).toBeNull();

    fireEvent.click(terms());
    expect(google).toBeEnabled();
    expect(email).toBeEnabled();
    // o aceite segue para o servidor nos dois formulários
    expect(document.querySelectorAll('input[type=hidden][name="acceptTerms"]')).toHaveLength(2);

    fireEvent.click(terms());
    expect(google).toBeDisabled();
  });

  it("/entrar não exige a checkbox", () => {
    render(<AuthForm mode="entrar" />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: /Entrar com Google/ })).toBeEnabled();
  });
});

describe("checkbox de aceite no checkout", () => {
  it("Pix e cartão ficam desabilitados até aceitar", () => {
    render(
      <SubscribePlanForm
        planCode="essencial"
        planName="Essencial"
        credits={3}
        priceFormatted="R$ 1"
      />,
    );
    const pix = screen.getByRole("button", { name: /com Pix/ });
    const card = screen.getByRole("button", { name: /cartão de crédito/ });
    expect(pix).toBeDisabled();
    expect(card).toBeDisabled();
    fireEvent.click(terms());
    expect(pix).toBeEnabled();
    expect(card).toBeEnabled();
  });
});

describe("rodapé", () => {
  it("tem links para Termos e Privacidade (sem 'em breve')", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: "Privacidade e LGPD" })).toHaveAttribute(
      "href",
      "/privacidade",
    );
    expect(screen.queryByText(/em breve/)).toBeNull();
  });
});
