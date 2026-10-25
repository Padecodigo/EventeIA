import { describe, expect, it } from "vitest";

import {
  formatPairingCode,
  isMobileUserAgent,
  parseConnectResponse,
  parsePairingPhone,
} from "@/lib/whatsapp/pairing";

describe("parsePairingPhone", () => {
  it("normaliza celular BR para dígitos E.164", () => {
    expect(parsePairingPhone("(11) 99876-5432")).toBe("5511998765432");
    expect(parsePairingPhone("+55 11 99876-5432")).toBe("5511998765432");
    expect(parsePairingPhone("1133334444")).toBe("551133334444");
  });
  it("aceita outros países com +", () => {
    expect(parsePairingPhone("+1 415 555 2671")).toBe("14155552671");
  });
  it("rejeita entradas inválidas", () => {
    for (const bad of [
      "",
      "abc",
      "123",
      "11 88765-4321",
      "00 99999-9999",
      "11 99999-9999",
      "+0123",
      "11 9abc",
    ]) {
      expect(parsePairingPhone(bad)).toBeNull();
    }
  });
});

describe("isMobileUserAgent", () => {
  it("detecta Android e iPhone", () => {
    expect(isMobileUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari")).toBe(true);
    expect(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
  });
  it("desktop e ausente = false", () => {
    expect(isMobileUserAgent("Mozilla/5.0 (X11; Fedora; Linux x86_64) Firefox/130")).toBe(false);
    expect(isMobileUserAgent(null)).toBe(false);
  });
});

describe("parseConnectResponse", () => {
  it("extrai código formatado e QR como data URL", () => {
    expect(
      parseConnectResponse({ pairingCode: "wzyx1234", code: "2@abc", base64: "iVBOR" }),
    ).toEqual({
      pairingCode: "WZYX-1234",
      qrDataUrl: "data:image/png;base64,iVBOR",
      alreadyConnected: false,
    });
  });
  it("mantém data URL existente e detecta instância já aberta", () => {
    expect(
      parseConnectResponse({ base64: "data:image/png;base64,x", pairingCode: null }).qrDataUrl,
    ).toBe("data:image/png;base64,x");
    expect(parseConnectResponse({ instance: { state: "open" } }).alreadyConnected).toBe(true);
  });
  it("resposta estranha não quebra", () => {
    expect(parseConnectResponse("x")).toEqual({
      pairingCode: null,
      qrDataUrl: null,
      alreadyConnected: false,
    });
  });
});

it("formatPairingCode", () => {
  expect(formatPairingCode("ABCD-EFGH")).toBe("ABCD-EFGH");
  expect(formatPairingCode("abc")).toBe("ABC");
});
