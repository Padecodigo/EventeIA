import { describe, expect, it } from "vitest";

import { formatWhatsappNumber, resolvePanelConnection } from "@/lib/whatsapp/panel-status";

describe("resolvePanelConnection", () => {
  it("regressão: banco 'disconnected' mas Evolution 'open' ⇒ conectado, sem aviso", () => {
    expect(resolvePanelConnection("disconnected", "open")).toEqual({
      connected: true,
      showDisconnectedAlert: false,
    });
  });
  it("banco ativo ⇒ conectado mesmo sem resposta da Evolution", () => {
    expect(resolvePanelConnection("active", null).connected).toBe(true);
    expect(resolvePanelConnection("connected", "close").connected).toBe(true);
  });
  it("desconectado de verdade ⇒ aviso", () => {
    expect(resolvePanelConnection("disconnected", "close")).toEqual({
      connected: false,
      showDisconnectedAlert: true,
    });
    expect(resolvePanelConnection(null, null)).toEqual({
      connected: false,
      showDisconnectedAlert: false,
    });
  });
});

describe("formatWhatsappNumber", () => {
  it("formata jid BR", () => {
    expect(formatWhatsappNumber("5512981631234@s.whatsapp.net")).toBe("+55 12 98163-1234");
    expect(formatWhatsappNumber("5512981631234:12@s.whatsapp.net")).toBe("+55 12 98163-1234");
    expect(formatWhatsappNumber(null)).toBeNull();
  });
});
