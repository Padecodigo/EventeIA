// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  signInWithGoogleAction: vi.fn(),
  signInWithFacebookAction: vi.fn(),
}));

vi.mock("@/components/auth/google-gis-button", async () => {
  const { useEffect } = await import("react");
  return {
    GoogleGisButton: ({ onUnavailable }: { onUnavailable: () => void }) => {
      useEffect(() => onUnavailable(), [onUnavailable]);
      return null;
    },
  };
});

import { AuthForm } from "@/components/auth/auth-form";

afterEach(cleanup);

describe("AuthForm — Facebook e Instagram", () => {
  it("esconde o botão do Facebook por padrão (flag off)", () => {
    render(<AuthForm mode="entrar" />);
    expect(screen.queryByTestId("facebook-oauth")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entrar com Facebook" })).not.toBeInTheDocument();
  });

  it("mostra Entrar com Facebook quando a flag está ligada", () => {
    render(<AuthForm mode="entrar" facebookLoginEnabled />);
    expect(screen.getByTestId("facebook-oauth")).toHaveTextContent("Entrar com Facebook");
  });

  it("no cadastro o botão do Facebook fica desabilitado até aceitar os termos", () => {
    render(<AuthForm mode="registrar" facebookLoginEnabled />);
    expect(screen.getByTestId("facebook-oauth")).toBeDisabled();
    expect(screen.getByTestId("facebook-oauth")).toHaveTextContent("Criar conta com Facebook");
  });

  it("mostra Instagram como Em breve, sem formulário de OAuth", () => {
    render(<AuthForm mode="entrar" />);
    const soon = screen.getByTestId("instagram-coming-soon");
    expect(soon).toBeDisabled();
    expect(soon).toHaveTextContent("Instagram — Em breve");
    expect(soon.closest("form")).toBeNull();
  });
});
