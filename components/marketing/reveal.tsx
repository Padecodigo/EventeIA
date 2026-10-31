"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Revelação sutil no scroll (fade + slide-up de 12px em 600ms, uma vez).
 * O conteúdo é visível por padrão (sem JS) e só é escondido após a montagem;
 * com prefers-reduced-motion não há qualquer animação.
 */
export function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    setHidden(true);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setHidden(false);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const cls = ["ev-reveal", hidden ? "ev-reveal-hidden" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={cls}>
      {children}
    </div>
  );
}
