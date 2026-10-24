"use client";

import Link from "next/link";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  eventHref,
  notificationsResponseSchema,
  selectUnseen,
  toastMessageFor,
  type NotificationItem,
} from "@/lib/notifications/toast";

const POLL_INTERVAL_MS = 20_000;

/** Polling leve de notificações + toast acessível (sem dependências novas). */
export function NotificationsPoller() {
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const seen = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const parsed = notificationsResponseSchema.safeParse(await response.json());
        if (!parsed.success || cancelled) return;
        const fresh = selectUnseen(parsed.data.notifications, seen.current);
        if (fresh.length === 0) return;
        for (const item of fresh) seen.current.add(item.id);
        setToasts((current) => [...fresh, ...current].slice(0, 3));
      } catch {
        // rede indisponível: tenta no próximo ciclo
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex max-w-sm flex-col gap-3" aria-live="polite" role="status">
      {toasts.map((item) => (
        <div key={item.id} className="rounded-2xl border border-line-subtle bg-off-white p-4 text-sm text-vinho shadow-lg">
          <p>{toastMessageFor(item)}</p>
          <div className="mt-3 flex gap-4">
            <Link href={eventHref(item)} className="font-semibold underline" onClick={() => dismiss(item.id)}>
              Ver orçamentos
            </Link>
            <button type="button" className="text-vinho/70" onClick={() => dismiss(item.id)}>
              Fechar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
