import { describe, expect, it } from "vitest";

import {
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
  it("mensagem de quotations_ready menciona encerramento do WhatsApp", () => {
    expect(toastMessageFor(item)).toBe(QUOTATIONS_READY_TOAST);
    expect(QUOTATIONS_READY_TOAST).toMatch(/conexão do WhatsApp encerrada por segurança/);
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
    expect(notificationsResponseSchema.safeParse({ notifications: [{ ...item, type: "x" }] }).success).toBe(false);
    expect(markReadBodySchema.safeParse({ ids: [] }).success).toBe(false);
    expect(markReadBodySchema.safeParse({ ids: [item.id], extra: 1 }).success).toBe(false);
  });
});
