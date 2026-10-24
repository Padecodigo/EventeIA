"use client";

import { useEffect, useState } from "react";

import { formatCountdown } from "@/lib/welcome/format";

/**
 * Contagem honesta no checkout: parte do tempo restante calculado pelo BANCO e avança com
 * performance.now() — mudar o relógio do aparelho não estende o prazo.
 */
export function WelcomeCountdown({ remainingMs, className = "" }: { remainingMs: number; className?: string }) {
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

  return (
    <time className={`font-semibold tabular-nums ${className}`} dateTime={`PT${String(Math.floor(left / 1000))}S`}>
      {left > 0 ? formatCountdown(left) : "expirada"}
    </time>
  );
}
