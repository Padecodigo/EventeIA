// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/perfil/password-actions", () => ({
  setPasswordAction: vi.fn(),
}));

import { PasswordForm } from "@/components/domain/password-form";

afterEach(cleanup);

describe("PasswordForm", () => {
  it("em Alterar senha pede a senha atual", () => {
    render(<PasswordForm hasPassword />);
    expect(screen.getByLabelText("Senha atual")).toBeRequired();
    expect(screen.getByLabelText("Nova senha")).toBeInTheDocument();
  });

  it("em Criar senha não pede a senha atual", () => {
    render(<PasswordForm hasPassword={false} />);
    expect(screen.queryByLabelText("Senha atual")).toBeNull();
    expect(screen.getByLabelText("Nova senha")).toBeInTheDocument();
  });
});
