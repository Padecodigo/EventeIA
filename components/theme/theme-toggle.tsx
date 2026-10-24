"use client";

import { useState } from "react";

import { THEME_COOKIE, nextPreference, themeClass, type ThemePreference } from "@/lib/theme/palette";

const LABELS: Record<ThemePreference, string> = { system: "Tema: sistema", dark: "Tema: escuro", light: "Tema: claro" };
const ICONS: Record<ThemePreference, string> = { system: "◐", dark: "☾", light: "☀" };

/** Alterna sistema → escuro → claro; persiste em cookie (1 ano) para o servidor renderizar sem flash. */
export function ThemeToggle({ initial, targetId }: { initial: ThemePreference; targetId: string }) {
  const [pref, setPref] = useState<ThemePreference>(initial);

  function cycle(): void {
    const next = nextPreference(pref);
    setPref(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const el = document.getElementById(targetId);
    if (el) {
      el.classList.remove("dark", "theme-system");
      const cls = themeClass(next);
      if (cls) el.classList.add(cls);
    }
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${LABELS[pref]} (clique para alternar)`}
      title={LABELS[pref]}
      className="rounded-full border border-white/30 px-3 py-1 text-sm text-ink-inverse transition hover:bg-white/10"
    >
      <span aria-hidden="true">{ICONS[pref]}</span>
      <span className="ml-1 hidden sm:inline">{LABELS[pref].replace("Tema: ", "")}</span>
    </button>
  );
}
