import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { renderDiscoveryFirstContact } from "@/lib/discovery/pure";
import {
  buildFirstContactTemplatePayload,
  firstContactTemplateParams,
  splitSentences,
} from "@/lib/whatsapp/cloud/template";
import {
  cloudEventId,
  parseCloudWebhook,
  verifyCloudChallenge,
  verifyCloudSignature,
} from "@/lib/whatsapp/cloud/webhook";

const SECRET = "segredo-de-teste";
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("assinatura X-Hub-Signature-256", () => {
  const body = '{"a":1}';
  it("aceita assinatura correta", () => {
    expect(verifyCloudSignature(body, sign(body), SECRET)).toBe(true);
  });
  it("rejeita assinatura errada, ausente, malformada ou sem segredo", () => {
    expect(verifyCloudSignature(body, sign(body, "outro"), SECRET)).toBe(false);
    expect(verifyCloudSignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(verifyCloudSignature(body, null, SECRET)).toBe(false);
    expect(verifyCloudSignature(body, "sha1=abc", SECRET)).toBe(false);
    expect(verifyCloudSignature(body, sign(body), undefined)).toBe(false);
    expect(verifyCloudSignature(body, sign(body), "")).toBe(false);
  });
});

describe("desafio GET", () => {
  const q = (o: Record<string, string>) => new URLSearchParams(o);
  it("devolve o challenge com token correto", () => {
    expect(
      verifyCloudChallenge(
        q({ "hub.mode": "subscribe", "hub.verify_token": "vt", "hub.challenge": "42" }),
        "vt",
      ),
    ).toBe("42");
  });
  it("nega token errado, modo errado ou sem configuração", () => {
    expect(
      verifyCloudChallenge(
        q({ "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" }),
        "vt",
      ),
    ).toBeNull();
    expect(
      verifyCloudChallenge(
        q({ "hub.mode": "other", "hub.verify_token": "vt", "hub.challenge": "1" }),
        "vt",
      ),
    ).toBeNull();
    expect(
      verifyCloudChallenge(
        q({ "hub.mode": "subscribe", "hub.verify_token": "vt", "hub.challenge": "1" }),
        undefined,
      ),
    ).toBeNull();
  });
});

describe("parseCloudWebhook", () => {
  it("converte mensagens e status em eventos canônicos", () => {
    const events = parseCloudWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    id: "wamid.1",
                    from: "5519999999999",
                    type: "text",
                    text: { body: "Olá, R$ 50 por pessoa" },
                  },
                  {
                    id: "wamid.2",
                    from: "5519999999999",
                    type: "button",
                    button: { text: "SAIR" },
                  },
                  { id: "wamid.3", from: "5519999999999", type: "image" },
                ],
                statuses: [
                  { id: "wamid.out", status: "delivered" },
                  { id: "wamid.out", status: "desconhecido" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      {
        kind: "message",
        messageId: "wamid.1",
        phone: "+5519999999999",
        text: "Olá, R$ 50 por pessoa",
      },
      { kind: "message", messageId: "wamid.2", phone: "+5519999999999", text: "SAIR" },
      { kind: "status", messageId: "wamid.out", status: "delivered" },
    ]);
    expect(cloudEventId(events![0])).toBe("message:wamid.1");
    expect(cloudEventId(events![2])).toBe("status:wamid.out:delivered");
  });
  it("rejeita payload que não é da WhatsApp Business", () => {
    expect(parseCloudWebhook({ object: "page", entry: [] })).toBeNull();
    expect(parseCloudWebhook({ foo: 1 })).toBeNull();
  });
});

describe("template de primeiro contato", () => {
  const text = renderDiscoveryFirstContact({
    vendorName: "Buffet Sabor",
    category: "buffet",
    eventTypeLabel: "Casamento",
    eventDateIso: "2026-12-12",
    city: "Campinas",
    guestCount: 120,
    items: [{ label: "Buffet de jantar completo", quantity: 120, unit: "por_pessoa" }],
    sourceProvider: "grok",
    now: new Date("2026-10-24T19:00:00Z"),
  });

  it("fatia o texto existente em N variáveis sem perder conteúdo", () => {
    const params = firstContactTemplateParams(text, 3);
    expect(params).toHaveLength(3);
    expect(params.join(" ")).toBe(splitSentences(text).join(" "));
    expect(params[0]).toMatch(/^Boa tarde, tudo bem\? Aqui é da EventeIA\./);
    for (const p of params) {
      expect(p).not.toMatch(/[\n\t]| {4,}/);
      expect(p.length).toBeGreaterThan(0);
    }
  });
  it("completa com '-' quando há menos frases que variáveis", () => {
    expect(firstContactTemplateParams("Oi.", 3)).toEqual(["Oi.", "-", "-"]);
    expect(() => firstContactTemplateParams("   ", 3)).toThrow();
  });
  it("monta o payload da Graph API", () => {
    const payload = buildFirstContactTemplatePayload({
      to: "+5519999999999",
      text,
      templateName: "eventeia_primeiro_contato",
      languageCode: "pt_BR",
    });
    expect(payload.to).toBe("5519999999999");
    expect(payload.type).toBe("template");
    expect(payload.template.name).toBe("eventeia_primeiro_contato");
    expect(payload.template.components[0].parameters).toHaveLength(3);
  });
});
