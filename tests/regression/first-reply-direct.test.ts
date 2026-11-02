import { describe, expect, it } from "vitest";

import {
  FIRST_REPLY_PROMPT,
  buildAgentMessages,
  dedupePersonaIntro,
  parseAgentReply,
} from "@/lib/prospecting/agent";

const ctx = { category: "bar de drinks", city: "São José dos Campos/SP", guestCount: 60 };

describe("primeira resposta direta (sem repetir contexto)", () => {
  it("prompt da 1ª resposta pede resposta curta, preço e proíbe repetir o evento", () => {
    const system =
      buildAgentMessages(ctx, [{ role: "user", content: "COTAÇÃO" }])[0]?.content ?? "";
    expect(system).toContain(FIRST_REPLY_PROMPT);
    expect(FIRST_REPLY_PROMPT).toMatch(/DIRETA/);
    expect(FIRST_REPLY_PROMPT).toMatch(/peça o valor/);
    expect(FIRST_REPLY_PROMPT).toMatch(/sem explicar o que fazemos/);
    expect(FIRST_REPLY_PROMPT).toMatch(/Não repita cidade, data, número de convidados/);
    expect(FIRST_REPLY_PROMPT).not.toMatch(/assistente virtual|\bIA\b/);
  });

  it("turnos seguintes não recebem o prompt de 1ª resposta", () => {
    const system =
      buildAgentMessages(ctx, [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Somos a EventeIA. Quanto você cobra?" },
        { role: "user", content: "depende" },
      ])[0]?.content ?? "";
    expect(system).not.toContain(FIRST_REPLY_PROMPT);
  });

  it("a frase de persona nunca aparece duas vezes", () => {
    const twice =
      "Somos a EventeIA, um serviço autônomo de prospecção de fornecedores. Somos a EventeIA, um serviço autônomo de prospecção de fornecedores para eventos. Quanto você cobra?";
    const out = dedupePersonaIntro(twice);
    expect(out.match(/somos a eventeia/gi)).toHaveLength(1);
    expect(out).toBe(
      "Somos a EventeIA, um serviço autônomo de prospecção de fornecedores. Quanto você cobra?",
    );
    const parsed = parseAgentReply(JSON.stringify({ reply: twice }));
    expect(parsed?.reply.match(/somos a eventeia/gi)).toHaveLength(1);
  });

  it("não mexe numa resposta com uma única apresentação", () => {
    const once =
      "Somos a EventeIA. Seguimos por aqui mesmo — quanto vocês cobram pelo bar de drinks?";
    expect(dedupePersonaIntro(once)).toBe(once);
  });
});
