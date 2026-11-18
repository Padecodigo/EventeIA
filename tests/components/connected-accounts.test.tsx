// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/perfil/identity-actions", () => ({
  linkFacebookAction: vi.fn(),
  unlinkFacebookAction: vi.fn(),
}));

import { ConnectedAccounts } from "@/components/domain/connected-accounts";

afterEach(cleanup);

describe("ConnectedAccounts", () => {
  it("com a flag desligada não mostra Conectar/Desconectar do Facebook", () => {
    render(
      <ConnectedAccounts
        facebookLoginEnabled={false}
        hasFacebook={false}
        hasGoogle
        canUnlinkFacebook={false}
      />,
    );
    expect(screen.queryByTestId("facebook-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("facebook-unlink")).not.toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByTestId("instagram-coming-soon")).toBeDisabled();
    expect(screen.getByTestId("instagram-coming-soon")).toHaveTextContent("Em breve");
  });

  it("mostra Conectar quando o Facebook não está vinculado", () => {
    render(
      <ConnectedAccounts
        facebookLoginEnabled
        hasFacebook={false}
        hasGoogle
        canUnlinkFacebook={false}
      />,
    );
    expect(screen.getByTestId("facebook-link")).toHaveTextContent("Conectar");
  });

  it("desabilita Desconectar quando seria a última forma de entrar", () => {
    render(
      <ConnectedAccounts
        facebookLoginEnabled
        hasFacebook
        hasGoogle={false}
        canUnlinkFacebook={false}
      />,
    );
    expect(screen.getByTestId("facebook-unlink")).toBeDisabled();
  });

  it("permite Desconectar quando há outra forma de entrar", () => {
    render(<ConnectedAccounts facebookLoginEnabled hasFacebook hasGoogle canUnlinkFacebook />);
    expect(screen.getByTestId("facebook-unlink")).toBeEnabled();
  });
});
