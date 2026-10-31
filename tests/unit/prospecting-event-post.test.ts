import { describe, expect, it } from "vitest";

import { validateCaption } from "@/lib/meta/publishing";
import {
  EVENT_POST_CTA,
  buildEventPostCaption,
  buildEventPostContent,
  buildEventPostImageParams,
  eventCodeFromId,
  eventCodeFromText,
  formatEventDate,
} from "@/lib/prospecting/event-post";

const eventId = "aaaaaaaa-0000-4000-8000-000000000001";
const source = {
  eventId,
  eventType: "casamento",
  eventDate: "2026-12-10",
  city: "Taubaté",
  region: "sp",
};

describe("post de prospecção por evento", () => {
  it("usa a chamada exata e inclui o código público do evento", () => {
    const caption = buildEventPostCaption(source);
    expect(caption).toContain(EVENT_POST_CTA);
    expect(caption).toContain(eventCodeFromId(eventId));
    expect(caption).toContain("Casamento");
    expect(caption).toContain("10/12/2026");
    expect(caption).toContain("Taubaté/SP");
  });

  it("respeita os limites de legenda da Meta", () => {
    expect(validateCaption(buildEventPostCaption(source))).toEqual({ ok: true });
  });

  it("código é determinístico e extraível do texto da DM", () => {
    const code = eventCodeFromId(eventId);
    expect(code).toMatch(/^EVT-[A-Z0-9]{8}$/);
    expect(eventCodeFromId(eventId)).toBe(code);
    expect(eventCodeFromText(`quero fornecer ${code}`)).toBe(code);
    expect(eventCodeFromText(`quero fornecer ${code.toLowerCase()}`)).toBe(code);
    expect(eventCodeFromText("sem código")).toBeNull();
    expect(eventCodeFromText("evento ABC123")).toBe("ABC123");
  });

  it("formata data sem depender de fuso", () => {
    expect(formatEventDate("2026-01-02")).toBe("02/01/2026");
    expect(formatEventDate("data livre")).toBe("data livre");
  });

  it("NÃO inclui PII do cliente na legenda nem nos parâmetros de imagem", () => {
    const pii = {
      title: "Aniversário da Maria Silva",
      ownerName: "Maria Silva",
      email: "maria@example.com",
      phone: "+55 12 99999-0000",
      document: "123.456.789-00",
      address: "Rua das Flores, 123",
    };
    // Campos extras são ignorados: o builder só lê a allowlist pública.
    const content = buildEventPostContent({ ...source, ...pii } as typeof source);

    const serialized = `${content.caption}\n${content.imagePrompt}\n${JSON.stringify(content.imageParams)}`;
    for (const value of Object.values(pii)) {
      expect(serialized).not.toContain(value);
    }
    expect(content.imageParams).toEqual({
      eventType: "casamento",
      eventDate: "2026-12-10",
      city: "Taubaté",
      region: "SP",
      eventCode: eventCodeFromId(eventId),
      artPath: "/brand/posts/casamento.jpg",
    });
  });

  it("parâmetros de imagem contêm tipo, data e cidade/região", () => {
    const params = buildEventPostImageParams(source);
    expect(params).toMatchObject({
      eventType: "casamento",
      eventDate: "2026-12-10",
      city: "Taubaté",
      region: "SP",
    });
  });
});
