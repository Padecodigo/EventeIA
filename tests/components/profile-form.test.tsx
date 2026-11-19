// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/perfil/actions", () => ({
  updateProfileAction: vi.fn(),
}));

import { ProfileForm } from "@/components/domain/profile-form";

afterEach(cleanup);

describe("ProfileForm", () => {
  it("não pede CPF e mantém nome, telefone, WhatsApp e Instagram", () => {
    render(
      <ProfileForm defaultName="Ana" defaultPhone="" defaultWhatsapp="" defaultInstagram="" />,
    );
    expect(screen.queryByLabelText(/^CPF$/i)).toBeNull();
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByLabelText("Telefone")).toBeInTheDocument();
    expect(screen.getByLabelText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByLabelText("Instagram")).toBeInTheDocument();
  });
});
