/** Lógica pura do toast de notificações (sem React; testável). */

import { z } from "zod";

import { quotationsReadyReadinessSchema } from "./readiness";

export const QUOTATIONS_READY_TOAST =
  "Busca finalizada. Seu orçamento de menor preço está pronto no painel.";
export const QUOTATIONS_INCOMPLETE_TOAST =
  "Busca finalizada, mas ainda faltam cotações válidas para algumas necessidades. Confira no painel.";
export const QUOTATIONS_EMPTY_TOAST =
  "Busca finalizada sem cotações válidas. Confira os próximos passos no painel.";
/** Payload antigo/sem prontidão: não afirma que o orçamento está pronto. */
export const QUOTATIONS_ENDED_TOAST = "Busca finalizada. Confira a coleta de cotações no painel.";

const notificationPayloadSchema = z
  .object({ readiness: quotationsReadyReadinessSchema.optional() })
  .optional();

export const notificationItemSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("quotations_ready"),
  event_id: z.string().uuid().nullable(),
  created_at: z.string(),
  payload: notificationPayloadSchema,
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationItemSchema),
});

export const markReadBodySchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(50) })
  .strict();

export function toastMessageFor(item: NotificationItem): string {
  switch (item.type) {
    case "quotations_ready":
      switch (item.payload?.readiness?.status) {
        case "complete":
          return QUOTATIONS_READY_TOAST;
        case "incomplete":
          return QUOTATIONS_INCOMPLETE_TOAST;
        case "empty":
          return QUOTATIONS_EMPTY_TOAST;
        case undefined:
          return QUOTATIONS_ENDED_TOAST;
        default:
          return QUOTATIONS_ENDED_TOAST;
      }
  }
}

/** Devolve só as notificações ainda não exibidas (evita toast repetido entre polls). */
export function selectUnseen(
  items: readonly NotificationItem[],
  seen: ReadonlySet<string>,
): NotificationItem[] {
  return items.filter((item) => !seen.has(item.id));
}

export function eventHref(item: NotificationItem): string {
  return item.event_id !== null ? `/eventos/${item.event_id}` : "/painel";
}
