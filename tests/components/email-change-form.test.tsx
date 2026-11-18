// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/perfil/email-actions", () => ({
  changeEmailAction: vi.fn(),
}));

import { EmailChangeForm } from "@/components/domain/email-change-form";

afterEach(cleanup);

describe("EmailChangeForm", () => {
  it("pede o novo e-mail", () => {
    render(<EmailChangeForm />);
    expect(screen.getByLabelText("Novo e-mail")).toBeRequired();
    expect(screen.getByRole("button", { name: "Alterar e-mail" })).toBeInTheDocument();
  });
});
