/** Lógica pura do toast de notificações (sem React; testável). */

import { z } from "zod";

export const QUOTATIONS_READY_TOAST =
  "Busca finalizada e conexão do WhatsApp encerrada por segurança. Seus orçamentos estão prontos.";

export const notificationItemSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("quotations_ready"),
  event_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationItemSchema),
});

export const markReadBodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).strict();

export function toastMessageFor(item: NotificationItem): string {
  switch (item.type) {
    case "quotations_ready":
      return QUOTATIONS_READY_TOAST;
  }
}

/** Devolve só as notificações ainda não exibidas (evita toast repetido entre polls). */
export function selectUnseen(items: readonly NotificationItem[], seen: ReadonlySet<string>): NotificationItem[] {
  return items.filter((item) => !seen.has(item.id));
}

export function eventHref(item: NotificationItem): string {
  return item.event_id !== null ? `/eventos/${item.event_id}` : "/painel";
}
