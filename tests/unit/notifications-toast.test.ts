import { describe, expect, it } from "vitest";

import {
  QUOTATIONS_EMPTY_TOAST,
  QUOTATIONS_ENDED_TOAST,
  QUOTATIONS_INCOMPLETE_TOAST,
  QUOTATIONS_READY_TOAST,
  eventHref,
  markReadBodySchema,
  notificationsResponseSchema,
  selectUnseen,
  toastMessageFor,
} from "@/lib/notifications/toast";

const item = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "quotations_ready" as const,
  event_id: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-10-24T09:00:00Z",
};

describe("toast de notificações", () => {
  it("payload antigo/sem prontidão fica neutro e não afirma orçamento pronto", () => {
    expect(toastMessageFor(item)).toBe(QUOTATIONS_ENDED_TOAST);
    expect(QUOTATIONS_ENDED_TOAST).not.toMatch(/orçamento.*pronto|menor preço/i);
    expect(QUOTATIONS_ENDED_TOAST).not.toMatch(/WhatsApp/i);
  });

  it("distingue coleta completa, parcial e sem cotações", () => {
    expect(toastMessageFor({ ...item, payload: { readiness: { status: "complete" } } })).toBe(
      QUOTATIONS_READY_TOAST,
    );
    expect(
      toastMessageFor({
        ...item,
        payload: { readiness: { status: "incomplete", uncovered: ["doces"] } },
      }),
    ).toBe(QUOTATIONS_INCOMPLETE_TOAST);
    expect(toastMessageFor({ ...item, payload: { readiness: { status: "empty" } } })).toBe(
      QUOTATIONS_EMPTY_TOAST,
    );
    expect(QUOTATIONS_READY_TOAST).toContain("menor preço");
    expect(QUOTATIONS_INCOMPLETE_TOAST).not.toMatch(/menor preço|está pronto/i);
    expect(QUOTATIONS_EMPTY_TOAST).not.toMatch(/menor preço|está pronto/i);
  });

  it("nunca menciona as modalidades removidas", () => {
    for (const message of [
      QUOTATIONS_READY_TOAST,
      QUOTATIONS_INCOMPLETE_TOAST,
      QUOTATIONS_EMPTY_TOAST,
      QUOTATIONS_ENDED_TOAST,
    ]) {
      expect(message).not.toMatch(
        /custo[- ]benef[ií]cio|comodidade|mais pr[aá]tico|3 opções|três opções/i,
      );
    }
  });

  it("não repete toast já exibido", () => {
    expect(selectUnseen([item], new Set())).toHaveLength(1);
    expect(selectUnseen([item], new Set([item.id]))).toHaveLength(0);
  });
  it("link para o evento ou painel", () => {
    expect(eventHref(item)).toBe(`/eventos/${item.event_id}`);
    expect(eventHref({ ...item, event_id: null })).toBe("/painel");
  });
  it("valida resposta e corpo de marcação", () => {
    expect(notificationsResponseSchema.safeParse({ notifications: [item] }).success).toBe(true);
    expect(
      notificationsResponseSchema.safeParse({
        notifications: [{ ...item, payload: { readiness: { status: "complete" } } }],
      }).success,
    ).toBe(true);
    expect(
      notificationsResponseSchema.safeParse({ notifications: [{ ...item, type: "x" }] }).success,
    ).toBe(false);
    expect(markReadBodySchema.safeParse({ ids: [] }).success).toBe(false);
    expect(markReadBodySchema.safeParse({ ids: [item.id], extra: 1 }).success).toBe(false);
  });
});
