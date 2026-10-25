// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(dashboard)/eventos/whatsapp-actions", () => ({
  requestWhatsappPairingAction: vi.fn(),
  whatsappConnectionStateAction: vi.fn(),
}));
vi.mock("@/app/(dashboard)/eventos/actions", () => ({ saveWhatsappNumberModeAction: vi.fn() }));

import { ProspectingPanel } from "@/components/domain/prospecting-panel";

describe("ProspectingPanel — conexão", () => {
  it("regressão: conectado ⇒ mostra 'Conectado' com número e esconde aviso e opções", () => {
    render(
      <ProspectingPanel
        eventId="e"
        prospects={[]}
        instanceStatus="disconnected"
        connection={{ connected: true, showDisconnectedAlert: false, phone: "+55 12 98163-1234" }}
      />,
    );
    expect(screen.getByTestId("whatsapp-connected")).toHaveTextContent(
      "Conectado — WhatsApp +55 12 98163-1234",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Conectar WhatsApp")).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("desconectado ⇒ aviso e opções", () => {
    render(
      <ProspectingPanel
        eventId="e"
        prospects={[]}
        instanceStatus="disconnected"
        connection={{ connected: false, showDisconnectedAlert: true, phone: null }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("desconectado");
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });
});
