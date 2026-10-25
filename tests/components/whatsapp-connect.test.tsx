// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.fn();
const stateMock = vi.fn();
vi.mock("@/app/(dashboard)/eventos/whatsapp-actions", () => ({
  requestWhatsappPairingAction: (...a: unknown[]) => requestMock(...a),
  whatsappConnectionStateAction: (...a: unknown[]) => stateMock(...a),
}));

import { WhatsappConnect } from "@/components/domain/whatsapp-connect";

function setUA(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

beforeEach(() => {
  requestMock.mockReset();
  stateMock.mockReset();
  stateMock.mockResolvedValue({ state: "connecting" });
  requestMock.mockResolvedValue({
    ok: true,
    pairingCode: "WZYX-1234",
    qrDataUrl: "data:image/png;base64,QR",
    expiresAt: Date.now() + 60_000,
    connected: false,
  });
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function generate(phone = "11998765432") {
  fireEvent.change(screen.getByLabelText(/Número do WhatsApp/), { target: { value: phone } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Gerar código" }));
  });
}

describe("WhatsappConnect", () => {
  it("valida o número no cliente", async () => {
    setUA("Mozilla/5.0 (X11; Linux x86_64)");
    render(<WhatsappConnect eventId="e1" />);
    await generate("123");
    expect(screen.getByRole("alert")).toHaveTextContent("Número inválido");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("desktop: mostra QR e código, com copiar", async () => {
    setUA("Mozilla/5.0 (X11; Linux x86_64)");
    render(<WhatsappConnect eventId="e1" />);
    await generate();
    expect(requestMock).toHaveBeenCalledWith("e1", "11998765432");
    expect(screen.getByTestId("qr-block")).toHaveClass("block");
    expect(screen.getByTestId("pairing-code")).toHaveTextContent("WZYX-1234");
    expect(screen.getByText("Abrir o WhatsApp").parentElement).toHaveClass("hidden");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar código" }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("WZYX1234");
    expect(screen.getByRole("button", { name: "Copiado!" })).toBeInTheDocument();
  });

  it("celular: esconde o QR e oferece abrir o WhatsApp + passo a passo", async () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile");
    render(<WhatsappConnect eventId="e1" />);
    await generate();
    expect(screen.getByTestId("qr-block")).toHaveClass("hidden");
    expect(screen.getByText("Abrir o WhatsApp")).toHaveAttribute("href", "whatsapp://");
    expect(screen.getByText(/Conectar com número de telefone/)).toBeInTheDocument();
  });

  it("countdown expira e polling detecta a conexão", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    setUA("Mozilla/5.0 (X11; Linux x86_64)");
    requestMock.mockResolvedValue({
      ok: true,
      pairingCode: "WZYX-1234",
      qrDataUrl: null,
      expiresAt: Date.now() + 5_000,
      connected: false,
    });
    render(<WhatsappConnect eventId="e1" />);
    await generate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(screen.getByText(/O código expirou/)).toBeInTheDocument();
    stateMock.mockResolvedValue({ state: "open" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_100);
    });
    expect(screen.getByText("Conectado! Podemos prosseguir?")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Prosseguir" }));
    });
    expect(screen.getByTestId("quote-preparing-notice")).toHaveTextContent("até 2 dias úteis");
  });

  it("autoStart no desktop: QR aparece sem pedir número", async () => {
    setUA("Mozilla/5.0 (X11; Linux x86_64)");
    await act(async () => {
      render(<WhatsappConnect eventId="e1" autoStart />);
    });
    expect(requestMock).toHaveBeenCalledWith("e1", "");
    expect(screen.getByTestId("qr-block")).toBeInTheDocument();
    expect(screen.getByLabelText(/Conectar com código/)).toBeInTheDocument();
  });

  it("autoStart no celular: pede o número (necessário para o código), sem disparar sozinho", async () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile");
    await act(async () => {
      render(<WhatsappConnect eventId="e1" autoStart />);
    });
    expect(requestMock).not.toHaveBeenCalled();
    await generate();
    expect(requestMock).toHaveBeenCalledWith("e1", "11998765432");
  });
});

describe("WhatsappConnect — conectar com código", () => {
  it("desktop: após o QR, informar o número mostra o código grande", async () => {
    setUA("Mozilla/5.0 (X11; Linux x86_64)");
    requestMock.mockResolvedValueOnce({
      ok: true,
      pairingCode: null,
      qrDataUrl: "data:image/png;base64,QR",
      expiresAt: Date.now() + 60_000,
      connected: false,
    });
    requestMock.mockResolvedValueOnce({
      ok: true,
      pairingCode: "ABCD-1234",
      qrDataUrl: "data:image/png;base64,QR",
      expiresAt: Date.now() + 60_000,
      connected: false,
    });
    await act(async () => {
      render(<WhatsappConnect eventId="e1" autoStart />);
    });
    fireEvent.change(screen.getByLabelText(/Conectar com código/), {
      target: { value: "(11) 99876-5432" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar código" }));
    });
    expect(requestMock).toHaveBeenLastCalledWith("e1", "(11) 99876-5432");
    expect(screen.getByTestId("pairing-code")).toHaveTextContent("ABCD-1234");
    expect(screen.getByTestId("pairing-code").className).toContain("text-4xl");
    expect(screen.getByTestId("qr-block")).toBeInTheDocument();
  });
});
