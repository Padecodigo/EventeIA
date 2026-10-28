"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SESSION_KEY = "eventeia:analytics-session";

function sessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing !== null && existing.length >= 8) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return "anon";
  }
}

/** Registra a visualização de cada rota pública em `/api/analytics/view`. */
export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const path = pathname ?? "/";
    if (path.startsWith("/admin") || path.startsWith("/api")) return;
    void fetch("/api/analytics/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, sessionId: sessionId() }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
