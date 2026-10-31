// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

// Login é 100% server-side: as actions vivem em "use server" com cadeia
// server-only, então mockamos o módulo (o formulário só as recebe via action).
vi.mock("@/app/(auth)/actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  signInWithGoogleAction: vi.fn(),
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

  it("cadastro oferece WhatsApp e Instagram opcionais", () => {
    render(<AuthForm mode="registrar" />);

    const whatsapp = screen.getByLabelText("WhatsApp (opcional)");
    const instagram = screen.getByLabelText("Instagram (opcional)");
    expect(whatsapp).toHaveAttribute("type", "tel");
    expect(whatsapp).toHaveAttribute("name", "whatsapp");
    expect(instagram).toHaveAttribute("name", "instagram");
  });

  it("login não pede WhatsApp nem Instagram", () => {
    render(<AuthForm mode="entrar" />);

    expect(screen.queryByLabelText("WhatsApp (opcional)")).toBeNull();
    expect(screen.queryByLabelText("Instagram (opcional)")).toBeNull();
  });
});

describe("AuthForm — Entrar com Google", () => {
  it("botão do Google vem primeiro, antes do formulário de e-mail", () => {
    render(<AuthForm mode="entrar" />);
    const google = screen.getByRole("button", { name: /Entrar com Google/ });
    const email = screen.getByRole("button", { name: "Entrar com e-mail" });
    expect(google.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("cadastro oferece Criar conta com Google e mantém o e-mail como secundário", () => {
    render(<AuthForm mode="registrar" />);
    expect(screen.getByRole("button", { name: /Criar conta com Google/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar conta com e-mail" })).toBeInTheDocument();
  });

  it("mostra erro do callback OAuth", () => {
    render(<AuthForm mode="entrar" oauthError="Login com Google cancelado." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Login com Google cancelado.");
  });
});

describe("AuthForm — esqueci minha senha", () => {
  it("mostra o link só no modo entrar", () => {
    render(<AuthForm mode="entrar" />);
    expect(screen.getByRole("link", { name: "Esqueci minha senha" })).toHaveAttribute(
      "href",
      "/esqueci-senha",
    );
    cleanup();
    render(<AuthForm mode="registrar" />);
    expect(screen.queryByRole("link", { name: "Esqueci minha senha" })).toBeNull();
  });
});

describe("AuthForm — passo do Instagram no cadastro", () => {
  it("bloqueia a criação de conta até seguir + enviar mensagem", () => {
    render(<AuthForm mode="registrar" />);

    const emailButton = screen.getByRole("button", { name: "Criar conta com e-mail" });
    const googleButton = screen.getByRole("button", { name: /Criar conta com Google/ });
    expect(emailButton).toBeDisabled();
    expect(googleButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/Li e aceito os Termos/));
    fireEvent.click(screen.getByLabelText(/Já sigo @eventeia/));

    expect(emailButton).toBeEnabled();
    expect(googleButton).toBeEnabled();
  });

  it("mostra os links de seguir e enviar mensagem", () => {
    render(<AuthForm mode="registrar" />);

    expect(screen.getByRole("link", { name: /Siga @eventeia/ })).toHaveAttribute(
      "href",
      "https://www.instagram.com/eventeia",
    );
    expect(screen.getByRole("link", { name: /Envie uma mensagem para @eventeia/ })).toHaveAttribute(
      "href",
      expect.stringContaining("https://ig.me/m/eventeia"),
    );
  });
});
