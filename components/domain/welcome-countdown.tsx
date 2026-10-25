"use client";

import { useEffect, useState } from "react";

import { formatCountdown, formatCountdownDays } from "@/lib/welcome/format";

/**
 * Contagem honesta: parte do tempo restante calculado pelo BANCO e avança com
 * performance.now() — mudar o relógio do aparelho não estende o prazo.
 * `format="dhms"` ⇒ dd:hh:mm:ss.
 */
export function WelcomeCountdown({
  remainingMs,
  className = "",
  format = "hms",
}: {
  remainingMs: number;
  className?: string;
  format?: "hms" | "dhms";
}) {
  const [left, setLeft] = useState(remainingMs);

  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => {
      const next = Math.max(0, remainingMs - (performance.now() - start));
      setLeft(next);
      if (next === 0) {
        window.clearInterval(id);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [remainingMs]);

  const text = format === "dhms" ? formatCountdownDays(left) : formatCountdown(left);
  return (
    <time
      className={`font-semibold tabular-nums ${className}`}
      dateTime={`PT${String(Math.floor(left / 1000))}S`}
    >
      {left > 0 ? text : "expirada"}
    </time>
  );
}
