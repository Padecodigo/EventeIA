"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary">
      Imprimir / salvar PDF
    </button>
  );
}
