import { describe, expect, it } from "vitest";

import { planPostBatches } from "@/lib/prospecting/batch";
import { isOptOut } from "@/lib/prospecting/opt-out";
import { parseStructuredQuote } from "@/lib/prospecting/quote";
import { routeInbound } from "@/lib/prospecting/router";
import {
  isWithinMessagingWindow,
  isWithinPrivateReplyWindow,
  privateReplyDeadline,
} from "@/lib/prospecting/window";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("lotes de post por limite de marcação", () => {
  const suppliers = [
    { handle: "buffet_a", category: "buffet" },
    { handle: "buffet_b", category: "buffet" },
    { handle: "buffet_c", category: "buffet" },
    { handle: "foto_a", category: "fotografia" },
  ];

  it("divide respeitando o máximo de marcações por post", () => {
    const batches = planPostBatches(suppliers, { maxTagsPerPost: 2, maxPostsPerDay: 10 });
    expect(batches.map((b) => b.handles)).toEqual([["buffet_a", "buffet_b"], ["buffet_c"], ["foto_a"]]);
    expect(batches.every((b) => b.handles.length <= 2)).toBe(true);
  });

  it("distribui no máximo maxPostsPerDay posts por dia", () => {
    const batches = planPostBatches(suppliers, { maxTagsPerPost: 1, maxPostsPerDay: 2 });
    const byDay = new Map<number, number>();
    for (const b of batches) byDay.set(b.dayIndex, (byDay.get(b.dayIndex) ?? 0) + 1);
    expect([...byDay.values()].every((n) => n <= 2)).toBe(true);
    expect(batches[0]?.dayIndex).toBe(0);
    expect(batches[2]?.dayIndex).toBe(1);
  });

  it("rejeita limites inválidos", () => {
    expect(() => planPostBatches(suppliers, { maxTagsPerPost: 0, maxPostsPerDay: 1 })).toThrow();
    expect(() => planPostBatches(suppliers, { maxTagsPerPost: 1, maxPostsPerDay: 0 })).toThrow();
  });
});

describe("janela de 24h e private reply de 7 dias", () => {
  it("aceita resposta dentro de 24h e rejeita depois", () => {
    const last = new Date("2026-10-27T12:00:00Z");
    expect(isWithinMessagingWindow(last, new Date(last.getTime() + 23 * HOUR))).toBe(true);
    expect(isWithinMessagingWindow(last, new Date(last.getTime() + 25 * HOUR))).toBe(false);
  });

  it("private reply vale 7 dias após o comentário", () => {
    const comment = new Date("2026-10-27T12:00:00Z");
    expect(privateReplyDeadline(comment).getTime()).toBe(comment.getTime() + 7 * DAY);
    expect(isWithinPrivateReplyWindow(comment, new Date(comment.getTime() + 6 * DAY))).toBe(true);
    expect(isWithinPrivateReplyWindow(comment, new Date(comment.getTime() + 8 * DAY))).toBe(false);
  });
});

describe("roteamento de webhook", () => {
  it("comentário com palavra-chave gera private reply", () => {
    expect(
      routeInbound({ kind: "comment", commentId: "c1", senderId: "s1", text: "quero COTAÇÃO" }, { keyword: "cotação" }),
    ).toEqual({ action: "private_reply", commentId: "c1" });
  });

  it("mensagem direta abre conversa", () => {
    expect(
      routeInbound({ kind: "message", messageId: "m1", senderId: "s1", text: "olá" }, { keyword: "cotação" }),
    ).toEqual({ action: "open_conversation", messageId: "m1" });
  });

  it("pedido de parada vira opt-out antes de qualquer outra regra", () => {
    expect(routeInbound({ kind: "message", messageId: "m1", senderId: "s1", text: "parar" }, { keyword: "x" })).toEqual({
      action: "opt_out",
    });
  });

  it("comentário sem a palavra-chave é ignorado", () => {
    expect(
      routeInbound({ kind: "comment", commentId: "c1", senderId: "s1", text: "que lindo!" }, { keyword: "cotação" }),
    ).toEqual({ action: "ignore", reason: "no_keyword" });
  });
});

describe("opt-out", () => {
  it("reconhece palavras de saída (com acento e maiúsculas)", () => {
    expect(isOptOut("PARAR")).toBe(true);
    expect(isOptOut("sair.")).toBe(true);
    expect(isOptOut("descadastrar")).toBe(true);
    expect(isOptOut("cancelar")).toBe(true);
  });

  it("não confunde frase comum com opt-out", () => {
    expect(isOptOut("quero cancelar o pedido")).toBe(false);
    expect(isOptOut("pode me enviar a cotação?")).toBe(false);
  });
});

describe("cotação estruturada", () => {
  it("valida uma cotação completa", () => {
    const quote = parseStructuredQuote({
      product: "buffet",
      specifications: "finger food",
      volume: 100,
      moq: 50,
      priceCents: 25000,
      deadlineDays: 10,
      shippingCents: 5000,
      paymentTerms: "50% entrada",
      validUntil: "2026-12-31",
    });
    expect(quote?.priceCents).toBe(25000);
  });

  it("rejeita preço fracionário e campos obrigatórios ausentes", () => {
    expect(parseStructuredQuote({ product: "buffet", priceCents: 12.5 })).toBeNull();
    expect(parseStructuredQuote({ priceCents: 100 })).toBeNull();
    expect(parseStructuredQuote(null)).toBeNull();
  });
});
