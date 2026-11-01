// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  signInWithGoogleAction: vi.fn(),
  signInWithGoogleIdTokenAction: vi.fn(),
}));

const gisProps = vi.hoisted(() => ({ last: undefined as undefined | Record<string, unknown> }));
vi.mock("@/components/auth/google-gis-button", () => ({
  GoogleGisButton: (props: Record<string, unknown>) => {
    gisProps.last = props;
    return <div data-testid="google-gis-button" />;
  },
}));

import { AuthForm } from "@/components/auth/auth-form";

afterEach(cleanup);

describe("AuthForm — botão oficial do Google (GIS)", () => {
  it("no login mostra o botão oficial no lugar do OAuth antigo", () => {
    render(<AuthForm mode="entrar" />);
    expect(screen.getByTestId("google-gis-button")).toBeInTheDocument();
    expect(screen.queryByTestId("google-oauth-fallback")).toBeNull();
    expect(gisProps.last?.intent).toBe("signin");
  });

  it("no cadastro só libera o botão oficial após termos + Instagram", () => {
    render(<AuthForm mode="registrar" />);
    expect(screen.queryByTestId("google-gis-button")).toBeNull();
    expect(screen.getByTestId("google-oauth-fallback")).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/Li e aceito os Termos/));
    fireEvent.click(screen.getByLabelText(/Já sigo @eventeia/));

    expect(screen.getByTestId("google-gis-button")).toBeInTheDocument();
    expect(gisProps.last?.intent).toBe("signup");
    expect(gisProps.last?.acceptedTerms).toBe(true);
  });
});
