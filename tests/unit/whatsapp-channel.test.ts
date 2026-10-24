import { describe, expect, it } from "vitest";

import {
  CUSTOMER_SERVICE_WINDOW_MS,
  isCloudConfigured,
  isWhatsappChannel,
  isWithinServiceWindow,
  resolveWhatsappChannel,
} from "@/lib/whatsapp/channel";

describe("seleção de canal WhatsApp", () => {
  it("padrão: cloud quando configurada, senão evolution", () => {
    expect(resolveWhatsappChannel({ cloudConfigured: true })).toBe("cloud");
    expect(resolveWhatsappChannel({ cloudConfigured: false })).toBe("evolution");
  });
  it("evento tem prioridade sobre o cliente", () => {
    expect(
      resolveWhatsappChannel({
        eventChannel: "evolution",
        profileChannel: "cloud",
        cloudConfigured: true,
      }),
    ).toBe("evolution");
    expect(
      resolveWhatsappChannel({
        eventChannel: null,
        profileChannel: "evolution",
        cloudConfigured: true,
      }),
    ).toBe("evolution");
  });
  it("cloud escolhida sem configuração cai para evolution", () => {
    expect(resolveWhatsappChannel({ eventChannel: "cloud", cloudConfigured: false })).toBe(
      "evolution",
    );
  });
  it("valor desconhecido é ignorado", () => {
    expect(resolveWhatsappChannel({ eventChannel: "sms", cloudConfigured: true })).toBe("cloud");
    expect(isWhatsappChannel("sms")).toBe(false);
  });
  it("isCloudConfigured exige token e phone number id não vazios", () => {
    expect(isCloudConfigured({})).toBe(false);
    expect(
      isCloudConfigured({ WHATSAPP_CLOUD_TOKEN: "x", WHATSAPP_CLOUD_PHONE_NUMBER_ID: " " }),
    ).toBe(false);
    expect(
      isCloudConfigured({ WHATSAPP_CLOUD_TOKEN: "x", WHATSAPP_CLOUD_PHONE_NUMBER_ID: "1" }),
    ).toBe(true);
  });
  it("janela de 24h", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    expect(isWithinServiceWindow(null, now)).toBe(false);
    expect(isWithinServiceWindow("lixo", now)).toBe(false);
    expect(isWithinServiceWindow(new Date(now.getTime() - 60_000), now)).toBe(true);
    expect(isWithinServiceWindow(new Date(now.getTime() - CUSTOMER_SERVICE_WINDOW_MS), now)).toBe(
      false,
    );
    expect(isWithinServiceWindow(new Date(now.getTime() + 60_000), now)).toBe(false);
  });
});
