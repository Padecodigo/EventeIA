// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveMock = vi.fn();
const requestMock = vi.fn();
vi.mock("@/app/(dashboard)/eventos/actions", () => ({
  saveWhatsappNumberModeAction: (...a: unknown[]) => saveMock(...a),
}));
vi.mock("@/app/(dashboard)/eventos/whatsapp-actions", () => ({
  requestWhatsappPairingAction: (...a: unknown[]) => requestMock(...a),
  whatsappConnectionStateAction: async () => ({ state: "connecting" }),
}));

import { WhatsappSetup } from "@/components/domain/whatsapp-setup";

beforeEach(() => {
  Object.defineProperty(window.navigator, "userAgent", {
    value: "Mozilla/5.0 (X11; Linux x86_64)",
    configurable: true,
  });
  saveMock.mockReset();
  saveMock.mockImplementation(async (_e: string, mode: string) => ({ saved: mode }));
  requestMock.mockReset();
  requestMock.mockResolvedValue({
    ok: true,
    pairingCode: "ABCD-1234",
    qrDataUrl: "data:image/png;base64,QR",
    expiresAt: Date.now() + 60_000,
    connected: false,
  });
});
afterEach(cleanup);

describe("WhatsappSetup (passo único)", () => {
  it("não há botões de 'Salvar' intermediários", () => {
    render(<WhatsappSetup eventId="e1" current={null} connected={false} />);
    expect(screen.queryByRole("button", { name: /Salvar/ })).toBeNull();
  });

  it.each([
    ["Número dedicado", "dedicated"],
    ["Meu número pessoal", "personal"],
  ])("%s: um clique persiste e mostra o QR na hora", async (label, mode) => {
    render(<WhatsappSetup eventId="e1" current={null} connected={false} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: new RegExp(label) }));
    });
    expect(saveMock).toHaveBeenCalledWith("e1", mode);
    expect(requestMock).toHaveBeenCalledWith("e1", "");
    expect(screen.getByTestId("qr-block")).toBeInTheDocument();
  });

  it("regressão 'Salvando…' eterno: falha ao salvar vira erro e não trava a UI", async () => {
    saveMock.mockRejectedValue(new Error("Failed to find Server Action"));
    render(<WhatsappSetup eventId="e1" current={null} connected={false} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /Número dedicado/ }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar");
    expect(screen.queryByText(/Salvando/)).toBeNull();
    expect(screen.getByRole("radio", { name: /Meu número pessoal/ })).toBeEnabled();
  });

  it("já conectado ⇒ só o aviso de preparo (sem spinner)", () => {
    render(<WhatsappSetup eventId="e1" current="personal" connected />);
    expect(screen.getByTestId("quote-preparing-notice")).toBeInTheDocument();
  });
});
