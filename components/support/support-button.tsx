"use client";

import { useState } from "react";

import { SupportForm } from "./support-form";

/** Botão flutuante "Ajuda e feedback" (área logada). */
export function SupportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-vinho px-5 py-3 text-sm font-semibold text-off-white shadow-lg transition hover:bg-primaria-escura"
      >
        Ajuda e feedback
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-dialog-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-areia-quente p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="support-dialog-title" className="font-serif text-xl text-vinho">
                Ajuda e feedback
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-xl text-vinho/70">
                ×
              </button>
            </div>
            <SupportForm withEmail={false} onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
