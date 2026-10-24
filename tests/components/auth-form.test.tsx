// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

// Login é 100% server-side: as actions vivem em "use server" com cadeia
// server-only, então mockamos o módulo (o formulário só as recebe via action).
vi.mock("@/app/(auth)/actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
}));

import { AuthForm } from "@/components/auth/auth-form";

afterEach(cleanup);

describe("AuthForm — campo de senha", () => {
  it("começa oculto (type=password)", () => {
    render(<AuthForm mode="entrar" />);
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
  });

  it("olho mostra a senha e volta a ocultar", () => {
    render(<AuthForm mode="entrar" />);

    const input = screen.getByLabelText("Senha");
    const show = screen.getByRole("button", { name: "Mostrar senha" });

    fireEvent.click(show);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar senha" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeInTheDocument();
  });

  it("alternar não perde o valor digitado", () => {
    render(<AuthForm mode="registrar" />);

    const input = screen.getByLabelText("Senha");
    fireEvent.change(input, { target: { value: "EventeIA@2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(input).toHaveValue("EventeIA@2026");
  });

  it("botão do olho não envia o formulário", () => {
    render(<AuthForm mode="entrar" />);

    const toggle = screen.getByRole("button", { name: "Mostrar senha" });
    expect(toggle).toHaveAttribute("type", "button");
  });
});

describe("AuthForm — formulário server-side", () => {
  it("submete para a action de entrada com e-mail e senha", () => {
    render(<AuthForm mode="entrar" />);

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@eventeia.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "EventeIA@2026" } });

    const form = screen.getByLabelText("Senha").closest("form");
    expect(form).toHaveAttribute("action");
  });

  it("cadastro pede nome completo além de e-mail e senha", () => {
    render(<AuthForm mode="registrar" />);

    expect(screen.getByLabelText("Nome completo")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  });
});
